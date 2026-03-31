"""
Soroban contract template routes for Calliope IDE.
Addresses issue #48.

Endpoints:
  GET  /api/templates              — list all available templates
  GET  /api/templates/<id>         — get metadata for one template
  POST /api/templates/generate     — generate a project from a template
"""

import os
import logging
from pathlib import Path
from flask import Blueprint, request, jsonify
from server.utils.auth_utils import token_required
from server.utils.monitoring import capture_exception
from server.utils.contract_templates import list_templates, get_template, generate_template

try:
    from server.models import Session
except Exception:
    Session = None  # type: ignore

templates_bp = Blueprint("templates", __name__, url_prefix="/api/templates")
logger = logging.getLogger(__name__)


@templates_bp.route("/", methods=["GET"])
@templates_bp.route("", methods=["GET"])
def list_all_templates():
    """
    List all available Soroban contract templates.

    Response JSON:
        success    (bool)
        templates  (list[dict]) — id, name, description, difficulty, tags
        total      (int)
    """
    try:
        templates = list_templates()
        return jsonify({
            "success": True,
            "templates": templates,
            "total": len(templates),
        }), 200
    except Exception as e:
        logger.exception("List templates error")
        return jsonify({"success": False, "error": "Failed to list templates"}), 500


@templates_bp.route("/<template_id>", methods=["GET"])
def get_template_info(template_id: str):
    """
    Get metadata for a single template.

    Response JSON:
        success   (bool)
        template  (dict) — id, name, description, difficulty, tags
    """
    try:
        template = get_template(template_id)
        if not template:
            return jsonify({
                "success": False,
                "error": f"Template '{template_id}' not found",
                "available": [t["id"] for t in list_templates()],
            }), 404
        return jsonify({"success": True, "template": template}), 200
    except Exception as e:
        logger.exception("Get template error")
        return jsonify({"success": False, "error": "Failed to get template"}), 500


@templates_bp.route("/generate", methods=["POST"])
@token_required
def generate_from_template(current_user):
    """
    Generate a new Soroban project from a template inside the session workspace.

    Request JSON:
        session_id    (int)   — active session ID
        template_id   (str)   — one of: hello_world, token, nft, governance
        project_name  (str)   — directory name for the new project
        package_name  (str)   — (optional) Rust package name in Cargo.toml

    Response JSON:
        success        (bool)
        template_id    (str)
        template_name  (str)
        project_path   (str)  — absolute path inside the session workspace
        files_created  (list[str])
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400

        session_id = data.get("session_id")
        if not session_id:
            return jsonify({"success": False, "error": "session_id is required"}), 400

        template_id = data.get("template_id", "").strip()
        if not template_id:
            return jsonify({"success": False, "error": "template_id is required"}), 400

        project_name = data.get("project_name", "").strip()
        if not project_name:
            return jsonify({"success": False, "error": "project_name is required"}), 400

        # Validate project_name — alphanumeric, underscores, hyphens only
        import re
        if not re.match(r'^[a-zA-Z][a-zA-Z0-9_\-]{0,63}$', project_name):
            return jsonify({
                "success": False,
                "error": "project_name must start with a letter and contain only letters, digits, hyphens, or underscores (max 64 chars)"
            }), 400

        # Verify session belongs to current user
        session = Session.query.filter_by(
            id=session_id, user_id=current_user.id, is_active=True
        ).first()
        if not session:
            return jsonify({"success": False, "error": "Session not found or access denied"}), 404

        instance_dir = session.instance_dir
        if not instance_dir or not os.path.isdir(instance_dir):
            return jsonify({"success": False, "error": "Session workspace not found"}), 404

        # Resolve and validate target path (block path traversal)
        base = os.path.abspath(instance_dir)
        target = os.path.abspath(os.path.join(base, project_name))
        if not target.startswith(base + os.sep):
            return jsonify({"success": False, "error": "Invalid project_name — path traversal detected"}), 400

        # Validate template exists
        if not get_template(template_id):
            from server.utils.contract_templates import list_templates as _lt
            return jsonify({
                "success": False,
                "error": f"Template '{template_id}' not found",
                "available": [t["id"] for t in _lt()],
            }), 404

        package_name = data.get("package_name", "").strip() or None

        # Generate the template
        result = generate_template(
            template_id=template_id,
            project_path=target,
            project_name=package_name,
        )

        logger.info(
            "User %s generated template '%s' at %s",
            current_user.username, template_id, target,
        )

        return jsonify(result), 201

    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except Exception as e:
        logger.exception("Generate template error")
        capture_exception(e, {
            "route": "templates.generate_from_template",
            "user_id": current_user.id,
        })
        return jsonify({"success": False, "error": "An error occurred while generating the template"}), 500
