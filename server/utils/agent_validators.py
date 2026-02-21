"""Input validation utilities for the AI agent endpoint"""
import re

AGENT_INPUT_MAX_LENGTH = 2000

# Commands that should never be executed
DANGEROUS_COMMAND_PATTERNS = [
    r"rm\s+-rf\s+/",
    r"rm\s+-rf\s+~",
    r"mkfs\.",
    r"dd\s+if=",
    r">\s*/dev/sd",
    r"chmod\s+-R\s+777\s+/",
    r"chown\s+-R\s+.*\s+/",
    r"curl\s+.*\|\s*(bash|sh)",
    r"wget\s+.*\|\s*(bash|sh)",
    r":()\{.*\};:",
    r"base64\s+-d\s+.*\|\s*(bash|sh)",
    r"python.*-c.*os\.(system|popen)",
    r"eval\s+.*\$\(",
    r"shutdown",
    r"reboot",
    r"passwd",
    r"/etc/shadow",
    r"/etc/passwd",
]

# Attempts to override or hijack the system prompt
PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(previous|all|above|prior)\s+instructions?",
    r"disregard\s+(previous|all|above|prior)\s+instructions?",
    r"forget\s+(previous|all|above|prior)\s+instructions?",
    r"you\s+are\s+now\s+(a\s+)?(?!calliope)",
    r"new\s+system\s+prompt",
    r"override\s+(system|instructions?|prompt)",
    r"act\s+as\s+(?!calliope)",
    r"pretend\s+(you\s+are|to\s+be)",
    r"jailbreak",
    r"dan\s+mode",
    r"developer\s+mode",
]


def validate_agent_input(data: str) -> tuple[bool, str]:
    """Validate user input before passing to the AI agent."""
    if not data:
        return False, "Query is required"

    if not isinstance(data, str):
        return False, "Query must be a string"

    cleaned = data.replace('\x00', '').strip()

    if not cleaned:
        return False, "Query cannot be empty or whitespace only"

    if len(cleaned) > AGENT_INPUT_MAX_LENGTH:
        return False, f"Query must be less than {AGENT_INPUT_MAX_LENGTH} characters"

    lower = cleaned.lower()
    for pattern in PROMPT_INJECTION_PATTERNS:
        if re.search(pattern, lower):
            return False, "Invalid query: contains disallowed instructions"

    return True, None


def is_dangerous_command(cmd: str) -> bool:
    """Check if a command matches known dangerous patterns before execution."""
    if not cmd or not cmd.strip():
        return False

    cmd_lower = cmd.lower().strip()

    for pattern in DANGEROUS_COMMAND_PATTERNS:
        if re.search(pattern, cmd_lower):
            return True

    return False


def sanitize_agent_input(data: str) -> str:
    """Sanitize agent input after validation passes."""
    if not data:
        return ""

    data = data.replace('\x00', '').strip()

    if len(data) > AGENT_INPUT_MAX_LENGTH:
        data = data[:AGENT_INPUT_MAX_LENGTH]

    return data