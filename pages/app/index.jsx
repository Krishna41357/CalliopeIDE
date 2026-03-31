"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Menu,
    X,
    FolderOpen,
    Settings,
    Play,
    Save,
    Download,
    MessageSquare,
    Send,
    ChevronLeft,
    Rocket,
    Github,
    GitPullRequest,
    RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { getPublicKey, signTransaction, isConnected } from "@stellar/freighter-api"

// ── Config ─────────────────────────────────────────────────────────────────────
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000"
const CONTEXT_DEBOUNCE_MS = 800
const RECENTLY_MODIFIED_LIMIT = 5

// ── Sample code lines for the editor preview ──────────────────────────────────
const CODE_LINES = [
    { num: 1,  code: "" },
    { num: 2,  code: "use soroban_sdk::{contract, contractimpl, Env, Symbol};" },
    { num: 3,  code: "" },
    { num: 4,  code: "#[contract]" },
    { num: 5,  code: "pub struct TokenContract;" },
    { num: 6,  code: "" },
    { num: 7,  code: "#[contractimpl]" },
    { num: 8,  code: "impl TokenContract {" },
    { num: 9,  code: "    pub fn initialize(env: Env, admin: Address) {" },
    { num: 10, code: "        env.storage().instance().set(&Symbol::short(\"admin\"), &admin);" },
    { num: 11, code: "    }" },
    { num: 12, code: "" },
    { num: 13, code: "    pub fn mint(env: Env, to: Address, amount: i128) {" },
    { num: 14, code: "        // mint logic here" },
    { num: 15, code: "    }" },
    { num: 16, code: "}" },
]

// ── Types ──────────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} ContextPayload
 * @property {string} project_path
 * @property {string|null} current_file_path
 * @property {Object} project_metadata
 * @property {string[]} recently_modified
 */

/**
 * @typedef {Object} ChatMessage
 * @property {"user"|"assistant"} role
 * @property {string} content
 */

export default function IDEApp() {
    // ── Layout state ───────────────────────────────────────────────────────────
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [chatOpen, setChatOpen] = useState(true)
    const [isMobile, setIsMobile] = useState(false)

    // ── Editor / project state ─────────────────────────────────────────────────
    const [message, setMessage] = useState("")
    const [activeFile, setActiveFile] = useState(null)
    const [projectId, setProjectId] = useState(null)
    const [isDeploying, setIsDeploying] = useState(false)
    const [contractId, setContractId] = useState(null)
    const chatMessagesRef = useRef(null)

    // ── Context pipeline state ─────────────────────────────────────────────────
    /** @type {[ContextPayload|null, Function]} */
    const [contextPayload, setContextPayload] = useState(null)
    const [contextSummary, setContextSummary] = useState(null)
    const [contextLoading, setContextLoading] = useState(false)
    const contextDebounceRef = useRef(null)
    const recentlyModifiedRef = useRef([])

    // ── Chat state ─────────────────────────────────────────────────────────────
    /** @type {[ChatMessage[], Function]} */
    const [chatHistory, setChatHistory] = useState([
        {
            role: "assistant",
            content: "Hello! I'm your AI assistant for Soroban smart contract development. How can I help you today?",
        },
    ])
    const [isSending, setIsSending] = useState(false)
    const chatBottomRef = useRef(null)

    // ── GitHub Push / PR state ─────────────────────────────────────────────────
    const [githubModalOpen, setGithubModalOpen] = useState(false)
    const [githubForm, setGithubForm] = useState({
        token: "",
        owner: "",
        repo: "",
        branch: "feature/calliope-changes",
        baseBranch: "main",
        filePath: "contract.rs",
        commitMessage: "Update contract from CalliopeIDE",
        createPR: false,
        prTitle: "Update smart contract",
        prBody: "",
    })
    const [githubStatus, setGithubStatus] = useState({ state: "idle", message: "", links: null })

    // ── Auth token ────────────────────────────────────────────────────────────
    const getAuthToken = () =>
        typeof window !== "undefined" ? localStorage.getItem("auth_token") : null

    // ── GitHub submit ─────────────────────────────────────────────────────────
    const handleGithubSubmit = async () => {
        setGithubStatus({ state: "pushing", message: "Pushing to GitHub…", links: null })
        const code = CODE_LINES.map((l) => l.code).join("\n")
        try {
            const pushRes = await fetch("/api/github", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "push",
                    token: githubForm.token,
                    owner: githubForm.owner,
                    repo: githubForm.repo,
                    branch: githubForm.branch,
                    baseBranch: githubForm.baseBranch,
                    filePath: githubForm.filePath,
                    content: code,
                    commitMessage: githubForm.commitMessage,
                }),
            })
            const pushData = await pushRes.json()
            if (!pushRes.ok) {
                setGithubStatus({ state: "error", message: pushData.error, links: null })
                return
            }
            if (!githubForm.createPR) {
                setGithubStatus({
                    state: "success",
                    message: `Pushed successfully! Commit: ${pushData.commit.slice(0, 7)}`,
                    links: { file: pushData.fileUrl },
                })
                return
            }
            setGithubStatus({ state: "creating-pr", message: "Creating pull request…", links: null })
            const prRes = await fetch("/api/github", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "pr",
                    token: githubForm.token,
                    owner: githubForm.owner,
                    repo: githubForm.repo,
                    branch: githubForm.branch,
                    baseBranch: githubForm.baseBranch,
                    prTitle: githubForm.prTitle,
                    prBody: githubForm.prBody,
                }),
            })
            const prData = await prRes.json()
            if (!prRes.ok) {
                setGithubStatus({ state: "error", message: prData.error, links: null })
                return
            }
            setGithubStatus({
                state: "success",
                message: `PR #${prData.prNumber} created!`,
                links: { file: pushData.fileUrl, pr: prData.prUrl },
            })
        } catch {
            setGithubStatus({ state: "error", message: "Network error. Please try again.", links: null })
        }
    }

    // ── Responsive layout ──────────────────────────────────────────────────────
    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 768
            setIsMobile(mobile)
            if (mobile) {
                setSidebarOpen(false)
                setChatOpen(false)
            } else if (window.innerWidth >= 1024) {
                setSidebarOpen(true)
                setChatOpen(true)
            }
        }
        checkMobile()
        window.addEventListener("resize", checkMobile)
        return () => window.removeEventListener("resize", checkMobile)
    }, [])

    // ── Auto-scroll chat ───────────────────────────────────────────────────────
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [chatHistory])

    // ── Context fetching ───────────────────────────────────────────────────────
    const fetchContext = useCallback(
        async (filePath) => {
            if (!projectId || !filePath) return
            const token = getAuthToken()
            if (!token) return
            setContextLoading(true)
            try {
                const res = await fetch(
                    `${BACKEND_URL}/api/projects/${projectId}/context`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            current_file_path: filePath,
                            recently_modified: recentlyModifiedRef.current.slice(0, RECENTLY_MODIFIED_LIMIT),
                        }),
                    }
                )
                if (!res.ok) return
                const data = await res.json()
                if (data.success) {
                    setContextPayload(data.context_payload)
                    setContextSummary(data.summary)
                }
            } catch (err) {
                console.warn("Context fetch failed:", err)
            } finally {
                setContextLoading(false)
            }
        },
        [projectId]
    )

    // ── Debounce context fetch on file change ──────────────────────────────────
    useEffect(() => {
        if (!activeFile) return
        clearTimeout(contextDebounceRef.current)
        contextDebounceRef.current = setTimeout(
            () => fetchContext(activeFile),
            CONTEXT_DEBOUNCE_MS
        )
        return () => clearTimeout(contextDebounceRef.current)
    }, [activeFile, fetchContext])

    // ── File selection ─────────────────────────────────────────────────────────
    const handleFileSelect = (filePath) => {
        setActiveFile(filePath)
    }

    // ── Save + context invalidation ────────────────────────────────────────────
    const handleSave = async () => {
        if (!projectId || !activeFile) return
        recentlyModifiedRef.current = [
            activeFile,
            ...recentlyModifiedRef.current.filter((f) => f !== activeFile),
        ].slice(0, RECENTLY_MODIFIED_LIMIT)
        const token = getAuthToken()
        if (!token) return
        try {
            await fetch(
                `${BACKEND_URL}/api/projects/${projectId}/context/invalidate`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                }
            )
            fetchContext(activeFile)
        } catch (_) {}
    }

    // ── Deploy (Freighter / Soroban) ───────────────────────────────────────────
    const handleDeploy = async () => {
        try {
            setIsDeploying(true)
            const connected = await isConnected()
            if (!connected) {
                alert("Please install and unlock Freighter extension.")
                return
            }
            const publicKey = await getPublicKey()
            if (!publicKey) return

            const uploadPrep = await fetch("/api/soroban/prepare-upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: 1,
                    wasm_path: "target/wasm32-unknown-unknown/release/contract.wasm",
                    public_key: publicKey,
                }),
            }).then((r) => r.json())
            if (!uploadPrep.success) throw new Error(uploadPrep.error)

            const signedUpload = await signTransaction(uploadPrep.unsigned_xdr, { network: "TESTNET" })

            const uploadResult = await fetch("/api/soroban/submit-tx", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signed_xdr: signedUpload }),
            }).then((r) => r.json())
            if (!uploadResult.success) throw new Error(uploadResult.error)
            const wasmHash = uploadResult.wasm_hash

            const createPrep = await fetch("/api/soroban/prepare-create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: 1,
                    wasm_hash: wasmHash,
                    public_key: publicKey,
                }),
            }).then((r) => r.json())
            if (!createPrep.success) throw new Error(createPrep.error)

            const signedCreate = await signTransaction(createPrep.unsigned_xdr, { network: "TESTNET" })

            const createResult = await fetch("/api/soroban/submit-tx", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signed_xdr: signedCreate }),
            }).then((r) => r.json())
            if (!createResult.success) throw new Error(createResult.error)

            setContractId(createResult.contract_id)
            alert(`Contract deployed successfully! ID: ${createResult.contract_id}`)
        } catch (error) {
            console.error("Deployment failed:", error)
            alert(`Deployment failed: ${error.message}`)
        } finally {
            setIsDeploying(false)
        }
    }

    // ── Send message (SSE streaming) ───────────────────────────────────────────
    const sendMessage = async () => {
        const trimmed = message.trim()
        if (!trimmed || isSending) return
        setMessage("")
        setIsSending(true)
        setChatHistory((prev) => [...prev, { role: "user", content: trimmed }])
        try {
            const agentPort = sessionStorage.getItem("agent_port") || "5001"
            const agentBase = `http://localhost:${agentPort}/`
            let res
            if (contextPayload) {
                const params = new URLSearchParams({ data: trimmed })
                res = await fetch(`${agentBase}?${params.toString()}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
                    },
                    body: JSON.stringify({ context_payload: contextPayload }),
                })
            } else {
                const params = new URLSearchParams({ data: trimmed })
                res = await fetch(`${agentBase}?${params.toString()}`, {
                    headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
                })
            }
            if (!res.ok || !res.body) throw new Error(`Agent returned ${res.status}`)

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let assistantBuffer = ""
            setChatHistory((prev) => [...prev, { role: "assistant", content: "" }])

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const chunk = decoder.decode(value, { stream: true })
                for (const line of chunk.split("\n")) {
                    if (!line.startsWith("data: ")) continue
                    try {
                        const event = JSON.parse(line.slice(6))
                        if (event.type === "output") {
                            assistantBuffer += event.data + "\n"
                            setChatHistory((prev) => {
                                const updated = [...prev]
                                updated[updated.length - 1] = { role: "assistant", content: assistantBuffer }
                                return updated
                            })
                        }
                    } catch (_) {}
                }
            }
        } catch (err) {
            setChatHistory((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${err.message}. Please check the agent is running.` },
            ])
        } finally {
            setIsSending(false)
        }
    }

    // ── Animation variants ─────────────────────────────────────────────────────
    const sidebarVariants = {
        open:   { x: 0,       opacity: 1 },
        closed: { x: "-100%", opacity: 0 },
    }
    const chatVariants = {
        open:   { x: 0,      opacity: 1 },
        closed: { x: "100%", opacity: 0 },
    }
    const closeAllOverlays = () => {
        setSidebarOpen(false)
        setChatOpen(false)
    }
    return (
        <div className="flex h-[100dvh] bg-[#0D1117] text-white overflow-hidden">

            {/* ── Mobile Backdrop ── */}
            <AnimatePresence>
                {isMobile && (sidebarOpen || chatOpen) && (
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-30 md:hidden touch-none"
                        onClick={closeAllOverlays}
                        aria-hidden="true"
                    />
                )}
            </AnimatePresence>

            {/* ── Sidebar ── */}
            <AnimatePresence>
                {(sidebarOpen || !isMobile) && (
                    <motion.aside
                        key="sidebar"
                        initial={isMobile ? "closed" : false}
                        animate="open"
                        exit="closed"
                        variants={sidebarVariants}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        aria-label="File Explorer"
                        className={[
                            "bg-[#161B22] border-r border-gray-700 flex flex-col shrink-0",
                            isMobile
                                ? "fixed left-0 top-0 h-full z-40 w-72 max-w-[80vw] shadow-2xl"
                                : sidebarOpen
                                    ? "relative w-64 lg:w-72"
                                    : "relative w-0 overflow-hidden",
                        ].join(" ")}
                    >
                        {/* Sidebar Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 min-h-[48px]">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 truncate">
                                Explorer
                            </h2>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSidebarOpen(false)}
                                aria-label="Close sidebar"
                                className="ml-2 shrink-0 h-8 w-8 p-0 text-gray-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* File Tree */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
                            {[
                                { icon: <FolderOpen className="w-4 h-4 text-blue-400 shrink-0" />, label: "src/",        indent: false, path: null },
                                { icon: <span className="w-4 text-center text-xs shrink-0">📄</span>, label: "contract.rs", indent: true,  path: "/workspace/src/contract.rs" },
                                { icon: <span className="w-4 text-center text-xs shrink-0">📄</span>, label: "lib.rs",      indent: true,  path: "/workspace/src/lib.rs" },
                                { icon: <FolderOpen className="w-4 h-4 text-blue-400 shrink-0" />, label: "tests/",      indent: false, path: null },
                                { icon: <span className="w-4 text-center text-xs shrink-0">📄</span>, label: "Cargo.toml", indent: false, path: "/workspace/Cargo.toml" },
                            ].map(({ icon, label, indent, path }) => (
                                <div
                                    key={label}
                                    onClick={() => path && handleFileSelect(path)}
                                    className={[
                                        "flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 cursor-pointer transition-colors",
                                        indent ? "ml-4" : "",
                                        activeFile === path ? "bg-gray-700 border-l-2 border-blue-400" : "",
                                    ].join(" ")}
                                >
                                    {icon}
                                    <span className="text-sm truncate">{label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Sidebar Footer */}
                        <div className="p-3 border-t border-gray-700">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start gap-2 text-gray-400 hover:text-white h-9 px-2"
                            >
                                <Settings className="w-4 h-4 shrink-0" />
                                <span className="truncate">Settings</span>
                            </Button>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* ── Main Content ── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* Toolbar */}
                <div className="h-12 bg-[#161B22] border-b border-gray-700 flex items-center px-3 gap-2 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                            className="h-8 w-8 p-0 shrink-0 text-gray-400 hover:text-white"
                        >
                            {sidebarOpen && !isMobile
                                ? <ChevronLeft className="w-4 h-4" />
                                : <Menu className="w-4 h-4" />
                            }
                        </Button>
                        <span className="text-sm text-gray-400 truncate">
                            {activeFile ? activeFile.split("/").pop() : "contract.rs"}
                        </span>
                    </div>

                    {/* Context status indicator */}
                    {contextSummary && (
                        <div className="hidden md:flex items-center gap-1 text-xs text-gray-500">
                            {contextLoading
                                ? <RefreshCw className="w-3 h-3 animate-spin" />
                                : <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                            }
                            <span>
                                {contextSummary.cache_hit ? "cached" : "fresh"} context
                                · {Math.round(contextSummary.total_chars / 100) / 10}k chars
                                · {contextSummary.related_files.length} related
                            </span>
                        </div>
                    )}

                    <div className="flex-1" />

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                        {/* Desktop Save */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSave}
                            className="hidden sm:inline-flex items-center gap-1 h-8 px-2 text-gray-400 hover:text-white"
                        >
                            <Save className="w-4 h-4" />
                            <span className="text-xs">Save</span>
                        </Button>
                        {/* Desktop Run */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="hidden sm:inline-flex items-center gap-1 h-8 px-2 text-gray-400 hover:text-white"
                        >
                            <Play className="w-4 h-4" />
                            <span className="text-xs">Run</span>
                        </Button>
                        {/* Mobile Save */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSave}
                            aria-label="Save"
                            className="sm:hidden h-8 w-8 p-0 text-gray-400 hover:text-white"
                        >
                            <Save className="w-4 h-4" />
                        </Button>
                        {/* Mobile Run */}
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Run"
                            className="sm:hidden h-8 w-8 p-0 text-gray-400 hover:text-white"
                        >
                            <Play className="w-4 h-4" />
                        </Button>
                        {/* Desktop GitHub Push */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setGithubStatus({ state: "idle", message: "", links: null }); setGithubModalOpen(true) }}
                            className="hidden sm:inline-flex items-center gap-1 h-8 px-2 text-gray-400 hover:text-white"
                            aria-label="Push to GitHub"
                        >
                            <Github className="w-4 h-4" />
                            <span className="text-xs">Push</span>
                        </Button>
                        {/* Mobile GitHub Push */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setGithubStatus({ state: "idle", message: "", links: null }); setGithubModalOpen(true) }}
                            aria-label="Push to GitHub"
                            className="sm:hidden h-8 w-8 p-0 text-gray-400 hover:text-white"
                        >
                            <Github className="w-4 h-4" />
                        </Button>
                        {/* Deploy */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDeploy}
                            disabled={isDeploying}
                            className={`hidden sm:flex p-1 h-auto ${isDeploying ? "text-blue-500 animate-pulse" : "text-gray-400 hover:text-white"}`}
                        >
                            <Rocket className="w-4 h-4 mr-1" />
                            {isDeploying ? "Deploying..." : "Deploy"}
                        </Button>
                        {/* Chat toggle */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setChatOpen(!chatOpen)}
                            aria-label={chatOpen ? "Close chat" : "Open chat"}
                            className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                        >
                            <MessageSquare className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Editor + Chat */}
                <div className="flex-1 flex overflow-hidden min-h-0">

                    {/* Code Editor */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <div className="flex-1 bg-[#0D1117] overflow-auto">
                            <div className="inline-grid min-w-full" style={{ gridTemplateColumns: "auto 1fr" }}>
                                <div
                                    className="select-none text-right pr-4 pl-4 py-4 text-gray-500 font-mono text-sm leading-6 border-r border-gray-800 bg-[#0D1117] sticky left-0"
                                    aria-hidden="true"
                                >
                                    {CODE_LINES.map(({ num }) => (
                                        <div key={num} className="leading-6">{num}</div>
                                    ))}
                                </div>
                                <div className="py-4 pl-4 pr-8 font-mono text-sm leading-6 text-gray-200 whitespace-pre overflow-x-auto">
                                    {CODE_LINES.map(({ num, code }) => (
                                        <div key={num} className="leading-6">{code || "\u00A0"}</div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Chat Panel */}
                    <AnimatePresence>
                        {(chatOpen || !isMobile) && (
                            <motion.div
                                key="chat"
                                initial={isMobile ? "closed" : false}
                                animate="open"
                                exit="closed"
                                variants={chatVariants}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                aria-label="AI Chat"
                                className={[
                                    "bg-[#161B22] border-l border-gray-700 flex flex-col shrink-0",
                                    isMobile
                                        ? "fixed right-0 top-0 h-full z-40 w-80 max-w-[88vw] shadow-2xl"
                                        : chatOpen
                                            ? "relative w-80 lg:w-96"
                                            : "relative w-0 overflow-hidden",
                                ].join(" ")}
                            >
                                {/* Chat Header */}
                                <div className="flex items-center justify-between px-4 border-b border-gray-700 min-h-[48px] shrink-0">
                                    <div className="flex flex-col">
                                        <h3 className="text-sm font-semibold truncate">AI Assistant</h3>
                                        {contextSummary?.current_file && (
                                            <span className="text-[10px] text-gray-500 truncate max-w-[180px]">
                                                {contextSummary.current_file}
                                            </span>
                                        )}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setChatOpen(false)}
                                        aria-label="Close chat"
                                        className="ml-2 shrink-0 h-8 w-8 p-0 text-gray-400 hover:text-white"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>

                                {/* Messages */}
                                <div
                                    ref={chatMessagesRef}
                                    className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
                                >
                                    {chatHistory.map((msg, idx) => (
                                        <div
                                            key={idx}
                                            className={`p-3 rounded-lg text-sm whitespace-pre-wrap break-words ${
                                                msg.role === "user"
                                                    ? "bg-blue-600 ml-8 max-w-[85%] ml-auto"
                                                    : "bg-[#0D1117] max-w-[90%]"
                                            }`}
                                        >
                                            {msg.content}
                                        </div>
                                    ))}
                                    <div ref={chatBottomRef} />
                                </div>

                                {/* Chat Input */}
                                <div className="p-3 border-t border-gray-700 shrink-0 pb-[env(safe-area-inset-bottom,12px)]">
                                    <div className="flex items-end gap-2">
                                        <input
                                            type="text"
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            placeholder={
                                                contextLoading
                                                    ? "Loading context…"
                                                    : activeFile
                                                    ? `Ask about ${activeFile.split("/").pop()}…`
                                                    : "Ask about your code…"
                                            }
                                            aria-label="Chat message input"
                                            disabled={isSending}
                                            className="flex-1 min-w-0 bg-[#0D1117] border border-gray-600 rounded-lg px-3 py-2 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[40px] placeholder-gray-500 disabled:opacity-50"
                                            style={{ fontSize: "16px" }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault()
                                                    sendMessage()
                                                }
                                            }}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            aria-label="Send message"
                                            disabled={isSending || !message.trim()}
                                            className="shrink-0 h-10 w-10 p-0 text-gray-400 hover:text-white disabled:opacity-40"
                                            onClick={sendMessage}
                                        >
                                            {isSending
                                                ? <RefreshCw className="w-4 h-4 animate-spin" />
                                                : <Send className="w-4 h-4" />
                                            }
                                        </Button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* ── GitHub Modal ── */}
            <AnimatePresence>
                {githubModalOpen && (
                    <motion.div
                        key="github-modal-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
                        onClick={(e) => { if (e.target === e.currentTarget) setGithubModalOpen(false) }}
                        aria-modal="true"
                        role="dialog"
                        aria-label="Push to GitHub"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="bg-[#161B22] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[90dvh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                                <div className="flex items-center gap-2">
                                    <Github className="w-5 h-5 text-white" />
                                    <h2 className="text-sm font-semibold">Push to GitHub</h2>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => setGithubModalOpen(false)}
                                    aria-label="Close" className="h-8 w-8 p-0 text-gray-400 hover:text-white">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            <div className="p-5 space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">GitHub Personal Access Token</label>
                                    <input type="password" value={githubForm.token}
                                        onChange={(e) => setGithubForm((f) => ({ ...f, token: e.target.value }))}
                                        placeholder="ghp_xxxxxxxxxxxx" autoComplete="off"
                                        className="w-full bg-[#0D1117] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Requires <code className="text-gray-400">contents:write</code> and <code className="text-gray-400">pull_requests:write</code> scopes.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Owner</label>
                                        <input type="text" value={githubForm.owner}
                                            onChange={(e) => setGithubForm((f) => ({ ...f, owner: e.target.value.trim() }))}
                                            placeholder="your-username"
                                            className="w-full bg-[#0D1117] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Repository</label>
                                        <input type="text" value={githubForm.repo}
                                            onChange={(e) => setGithubForm((f) => ({ ...f, repo: e.target.value.trim() }))}
                                            placeholder="my-repo"
                                            className="w-full bg-[#0D1117] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Push to branch</label>
                                        <input type="text" value={githubForm.branch}
                                            onChange={(e) => setGithubForm((f) => ({ ...f, branch: e.target.value.trim() }))}
                                            placeholder="feature/my-branch"
                                            className="w-full bg-[#0D1117] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Base branch</label>
                                        <input type="text" value={githubForm.baseBranch}
                                            onChange={(e) => setGithubForm((f) => ({ ...f, baseBranch: e.target.value.trim() }))}
                                            placeholder="main"
                                            className="w-full bg-[#0D1117] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">File path in repo</label>
                                    <input type="text" value={githubForm.filePath}
                                        onChange={(e) => setGithubForm((f) => ({ ...f, filePath: e.target.value.trim() }))}
                                        placeholder="src/contract.rs"
                                        className="w-full bg-[#0D1117] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                                </div>

                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">Commit message</label>
                                    <input type="text" value={githubForm.commitMessage}
                                        onChange={(e) => setGithubForm((f) => ({ ...f, commitMessage: e.target.value }))}
                                        placeholder="Update contract from CalliopeIDE"
                                        className="w-full bg-[#0D1117] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="checkbox" checked={githubForm.createPR}
                                        onChange={(e) => setGithubForm((f) => ({ ...f, createPR: e.target.checked }))}
                                        className="w-4 h-4 rounded accent-blue-500" />
                                    <span className="text-sm flex items-center gap-1.5">
                                        <GitPullRequest className="w-4 h-4 text-gray-400" />
                                        Create a Pull Request after push
                                    </span>
                                </label>

                                {githubForm.createPR && (
                                    <div className="space-y-3 pl-3 border-l-2 border-blue-600">
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">PR Title</label>
                                            <input type="text" value={githubForm.prTitle}
                                                onChange={(e) => setGithubForm((f) => ({ ...f, prTitle: e.target.value }))}
                                                placeholder="Update smart contract"
                                                className="w-full bg-[#0D1117] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">PR Description (optional)</label>
                                            <textarea value={githubForm.prBody}
                                                onChange={(e) => setGithubForm((f) => ({ ...f, prBody: e.target.value }))}
                                                placeholder="Describe your changes…" rows={3}
                                                className="w-full bg-[#0D1117] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600 resize-none" />
                                        </div>
                                    </div>
                                )}

                                {githubStatus.state !== "idle" && (
                                    <div className={[
                                        "rounded-lg px-4 py-3 text-sm",
                                        githubStatus.state === "error"
                                            ? "bg-red-900/40 border border-red-700 text-red-300"
                                            : githubStatus.state === "success"
                                            ? "bg-green-900/40 border border-green-700 text-green-300"
                                            : "bg-blue-900/40 border border-blue-700 text-blue-300",
                                    ].join(" ")}>
                                        <p>{githubStatus.message}</p>
                                        {githubStatus.links && (
                                            <div className="mt-2 flex flex-col gap-1">
                                                {githubStatus.links.file && (
                                                    <a href={githubStatus.links.file} target="_blank" rel="noopener noreferrer" className="underline text-xs">
                                                        View file on GitHub ↗
                                                    </a>
                                                )}
                                                {githubStatus.links.pr && (
                                                    <a href={githubStatus.links.pr} target="_blank" rel="noopener noreferrer" className="underline text-xs">
                                                        View Pull Request ↗
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-700">
                                <Button variant="ghost" size="sm" onClick={() => setGithubModalOpen(false)}
                                    className="text-gray-400 hover:text-white">
                                    Cancel
                                </Button>
                                <Button size="sm" onClick={handleGithubSubmit}
                                    disabled={["pushing", "creating-pr"].includes(githubStatus.state)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 flex items-center gap-1.5 disabled:opacity-50">
                                    <Github className="w-4 h-4" />
                                    {githubStatus.state === "pushing"
                                        ? "Pushing…"
                                        : githubStatus.state === "creating-pr"
                                        ? "Creating PR…"
                                        : githubForm.createPR
                                        ? "Push & Create PR"
                                        : "Push"}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}