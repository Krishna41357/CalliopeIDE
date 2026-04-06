"""
Soroban contract template system for Calliope IDE.
Addresses issue #48.

Provides 4 starter templates:
  - hello_world  : minimal greeting contract
  - token        : fungible token with transfer/balance
  - nft          : non-fungible token with mint/transfer
  - governance   : DAO proposal + voting contract

Templates are generated as valid working Soroban Rust projects
with correct Cargo.toml, src/lib.rs, and a README.
"""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Template registry ─────────────────────────────────────────────────────────

TEMPLATES = {
    "hello_world": {
        "name": "Hello World",
        "description": "Minimal Soroban contract — greeting function. Best starting point.",
        "difficulty": "beginner",
        "tags": ["starter", "beginner"],
    },
    "token": {
        "name": "Fungible Token",
        "description": "ERC-20-style token with initialize, transfer, and balance functions.",
        "difficulty": "intermediate",
        "tags": ["token", "defi"],
    },
    "nft": {
        "name": "NFT Contract",
        "description": "Non-fungible token with mint, transfer, owner_of, and token_uri.",
        "difficulty": "intermediate",
        "tags": ["nft", "collectible"],
    },
    "governance": {
        "name": "DAO Governance",
        "description": "On-chain proposal and voting system with quorum threshold.",
        "difficulty": "advanced",
        "tags": ["dao", "governance", "voting"],
    },
}


def list_templates() -> list[dict]:
    """Return metadata for all available templates."""
    return [
        {"id": tid, **meta}
        for tid, meta in TEMPLATES.items()
    ]


def get_template(template_id: str) -> dict | None:
    """Return metadata for a single template, or None if not found."""
    if template_id not in TEMPLATES:
        return None
    return {"id": template_id, **TEMPLATES[template_id]}


def _cargo_toml(package_name: str) -> str:
    return f"""[package]
name = "{package_name}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = {{ version = "22", features = ["testutils"] }}

[dev-dependencies]
soroban-sdk = {{ version = "22", features = ["testutils"] }}

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
"""


def _readme(template_name: str, description: str) -> str:
    return f"""# {template_name}

{description}

## Build

```bash
cargo build --target wasm32-unknown-unknown --release
```

## Test

```bash
cargo test
```

## Deploy

Use the Calliope IDE Soroban deploy panel to deploy the compiled `.wasm` artifact to Stellar testnet.
"""


# ── Template source code ──────────────────────────────────────────────────────

_SOURCES: dict[str, str] = {
    "hello_world": """\
#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, vec, Env, Symbol, Vec};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(env: Env, to: Symbol) -> Vec<Symbol> {
        vec![&env, symbol_short!("Hello"), to]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{symbol_short, vec, Env};

    #[test]
    fn test_hello() {
        let env = Env::default();
        let contract_id = env.register_contract(None, HelloContract);
        let client = HelloContractClient::new(&env, &contract_id);
        let words = client.hello(&symbol_short!("World"));
        assert_eq!(
            words,
            vec![&env, symbol_short!("Hello"), symbol_short!("World")]
        );
    }
}
""",

    "token": """\
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
pub enum DataKey {
    Balance(Address),
    TotalSupply,
    Admin,
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    pub fn initialize(env: Env, admin: Address, total_supply: i128) {
        assert!(!env.storage().instance().has(&DataKey::Admin), "already initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TotalSupply, &total_supply);
        env.storage().instance().set(&DataKey::Balance(admin.clone()), &total_supply);
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        assert!(amount > 0, "amount must be positive");
        let from_bal: i128 = env.storage().instance()
            .get(&DataKey::Balance(from.clone())).unwrap_or(0);
        assert!(from_bal >= amount, "insufficient balance");
        let to_bal: i128 = env.storage().instance()
            .get(&DataKey::Balance(to.clone())).unwrap_or(0);
        env.storage().instance().set(&DataKey::Balance(from), &(from_bal - amount));
        env.storage().instance().set(&DataKey::Balance(to), &(to_bal + amount));
    }

    pub fn balance(env: Env, address: Address) -> i128 {
        env.storage().instance().get(&DataKey::Balance(address)).unwrap_or(0)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }
}
""",

    "nft": """\
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

#[contracttype]
pub enum DataKey {
    Owner(u64),
    TokenUri(u64),
    NextTokenId,
    Admin,
}

#[contract]
pub struct NftContract;

#[contractimpl]
impl NftContract {
    pub fn initialize(env: Env, admin: Address) {
        assert!(!env.storage().instance().has(&DataKey::Admin), "already initialized");
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextTokenId, &0u64);
    }

    pub fn mint(env: Env, to: Address, uri: String) -> u64 {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let id: u64 = env.storage().instance()
            .get(&DataKey::NextTokenId).unwrap_or(0);
        env.storage().instance().set(&DataKey::Owner(id), &to);
        env.storage().instance().set(&DataKey::TokenUri(id), &uri);
        env.storage().instance().set(&DataKey::NextTokenId, &(id + 1));
        id
    }

    pub fn transfer(env: Env, from: Address, to: Address, token_id: u64) {
        from.require_auth();
        let owner: Address = env.storage().instance()
            .get(&DataKey::Owner(token_id)).unwrap();
        assert!(owner == from, "not the token owner");
        env.storage().instance().set(&DataKey::Owner(token_id), &to);
    }

    pub fn owner_of(env: Env, token_id: u64) -> Address {
        env.storage().instance().get(&DataKey::Owner(token_id)).unwrap()
    }

    pub fn token_uri(env: Env, token_id: u64) -> String {
        env.storage().instance().get(&DataKey::TokenUri(token_id)).unwrap()
    }
}
""",

    "governance": """\
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
pub enum DataKey {
    Proposal(u64),
    HasVoted(u64, Address),
    NextProposalId,
    Admin,
    QuorumThreshold,
}

#[contracttype]
#[derive(Clone)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Address,
    pub description_hash: u64,
    pub votes_for: u64,
    pub votes_against: u64,
    pub executed: bool,
}

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    pub fn initialize(env: Env, admin: Address, quorum_threshold: u64) {
        assert!(!env.storage().instance().has(&DataKey::Admin), "already initialized");
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::QuorumThreshold, &quorum_threshold);
        env.storage().instance().set(&DataKey::NextProposalId, &0u64);
    }

    pub fn propose(env: Env, proposer: Address, description_hash: u64) -> u64 {
        proposer.require_auth();
        let id: u64 = env.storage().instance()
            .get(&DataKey::NextProposalId).unwrap_or(0);
        let proposal = Proposal {
            id,
            proposer,
            description_hash,
            votes_for: 0,
            votes_against: 0,
            executed: false,
        };
        env.storage().instance().set(&DataKey::Proposal(id), &proposal);
        env.storage().instance().set(&DataKey::NextProposalId, &(id + 1));
        id
    }

    pub fn vote(env: Env, voter: Address, proposal_id: u64, support: bool) {
        voter.require_auth();
        let voted: bool = env.storage().instance()
            .get(&DataKey::HasVoted(proposal_id, voter.clone()))
            .unwrap_or(false);
        assert!(!voted, "already voted");
        let mut proposal: Proposal = env.storage().instance()
            .get(&DataKey::Proposal(proposal_id)).unwrap();
        if support { proposal.votes_for += 1; } else { proposal.votes_against += 1; }
        env.storage().instance().set(&DataKey::Proposal(proposal_id), &proposal);
        env.storage().instance().set(&DataKey::HasVoted(proposal_id, voter), &true);
    }

    pub fn get_proposal(env: Env, proposal_id: u64) -> Proposal {
        env.storage().instance().get(&DataKey::Proposal(proposal_id)).unwrap()
    }
}
""",
}


# ── Template generator ────────────────────────────────────────────────────────

def generate_template(
    template_id: str,
    project_path: str,
    project_name: str | None = None,
) -> dict:
    """
    Generate a Soroban project from a template into project_path.

    Creates:
      {project_path}/
        Cargo.toml
        src/
          lib.rs
        README.md

    Args:
        template_id:   One of the keys in TEMPLATES.
        project_path:  Absolute path to the target directory (must not exist).
        project_name:  Package name for Cargo.toml (default: template_id).

    Returns:
        dict with success, files_created, template_id, project_path.

    Raises:
        ValueError: Unknown template_id or project_path already exists.
        OSError:    File system errors.
    """
    if template_id not in TEMPLATES:
        raise ValueError(
            f"Unknown template '{template_id}'. "
            f"Available: {', '.join(TEMPLATES.keys())}"
        )

    target = Path(project_path)
    if target.exists():
        raise ValueError(f"Target path already exists: {project_path}")

    name = project_name or template_id.replace("-", "_")
    meta = TEMPLATES[template_id]
    source = _SOURCES[template_id]

    files_created = []

    # Create directory structure
    src_dir = target / "src"
    src_dir.mkdir(parents=True, exist_ok=False)

    # Write Cargo.toml
    cargo_path = target / "Cargo.toml"
    cargo_path.write_text(_cargo_toml(name))
    files_created.append("Cargo.toml")

    # Write src/lib.rs
    lib_path = src_dir / "lib.rs"
    lib_path.write_text(source)
    files_created.append("src/lib.rs")

    # Write README.md
    readme_path = target / "README.md"
    readme_path.write_text(_readme(meta["name"], meta["description"]))
    files_created.append("README.md")

    logger.info(
        "Generated template '%s' at %s (%d files)",
        template_id, project_path, len(files_created),
    )

    return {
        "success": True,
        "template_id": template_id,
        "template_name": meta["name"],
        "project_path": str(target),
        "files_created": files_created,
    }
