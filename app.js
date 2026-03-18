const SUPABASE_URL = "https://rdacbfbhwtvrvfiucbik.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pfcUf6-ijTAMa2Bf2FvWpg_J_Uh4kMT";

const storageKey = "marvel-watch-progress";
const grid = document.getElementById("grid");
const authStatus = document.getElementById("auth-status");
const syncStatus = document.getElementById("sync-status");
const signOutButton = document.getElementById("sign-out");
const signInButton = document.getElementById("sign-in");
const signUpButton = document.getElementById("sign-up");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let authBusy = false;
let entries = [];
let saved = JSON.parse(localStorage.getItem(storageKey) || "{}");

function setSyncStatus(message, mode = "default") {
    syncStatus.textContent = message;
    syncStatus.className = "pill";
    if (mode === "good") syncStatus.classList.add("good");
    if (mode === "warn") syncStatus.classList.add("warn");
    if (mode === "sync") syncStatus.classList.add("sync");
}

function setAuthBusy(isBusy) {
    authBusy = isBusy;
    signInButton.disabled = isBusy;
    signUpButton.disabled = isBusy;
    signOutButton.disabled = isBusy;
    emailInput.disabled = isBusy;
    passwordInput.disabled = isBusy;
}

function saveLocal() {
    localStorage.setItem(storageKey, JSON.stringify(saved));
}

function replaceLocalProgress(progress) {
    saved = progress && typeof progress === "object" ? { ...progress } : {};
    saveLocal();
}

async function getSessionUser() {
    const {
        data: { session },
        error,
    } = await supabaseClient.auth.getSession();

    if (error) {
        console.error(error);
        return null;
    }

    return session?.user ?? null;
}

async function loadEntries() {
    setSyncStatus("Loading movies...", "sync");

    const { data, error } = await supabaseClient.from("movies").select("*").order("movie_number", { ascending: true });

    if (error) {
        console.error(error);
        setSyncStatus("Failed to load movies", "warn");
        return;
    }

    entries = (data || []).map((movie) => ({
        n: movie.movie_number,
        title: movie.movie_name,
        url: movie.url,
        type: movie.type || "Movie",
        tag: movie.tag || null,
    }));

    render();

    const user = await getSessionUser();
    if (user) {
        setSyncStatus("Movies loaded", "good");
    } else {
        setSyncStatus("Movies loaded • sign in to sync", "good");
    }
}

function render() {
    grid.innerHTML = "";

    entries.forEach((entry) => {
        const watched = Boolean(saved[String(entry.n)] ?? saved[entry.n]);

        const card = document.createElement("a");
        card.className = `card${watched ? " done" : ""}`;
        card.href = entry.url;
        card.target = "_blank";
        card.rel = "noopener noreferrer";

        card.innerHTML = `
            <div class="check" title="Mark watched" aria-label="Mark watched">${watched ? "✓" : ""}</div>
            <div class="num">${entry.n}</div>
            <div class="title">${entry.title}</div>
            <div class="meta">${entry.type}</div>
            ${entry.tag ? `<div class="tag">${entry.tag}</div>` : ""}
        `;

        const check = card.querySelector(".check");
        check.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const key = String(entry.n);
            saved[key] = !Boolean(saved[key]);
            saveLocal();
            render();
            await syncToCloud();
        });

        grid.appendChild(card);
    });
}

async function loadRemoteProgress() {
    const user = await getSessionUser();
    if (!user) return;

    setSyncStatus("Loading cloud progress...", "sync");

    const { data, error } = await supabaseClient.from("watch_progress").select("progress").eq("user_id", user.id).maybeSingle();

    if (error) {
        console.error(error);
        setSyncStatus("Cloud load failed", "warn");
        return;
    }

    replaceLocalProgress(data?.progress || {});
    render();
    setSyncStatus("Cloud progress loaded", "good");
}

async function syncToCloud() {
    const user = await getSessionUser();
    if (!user) {
        setSyncStatus("Sign in to sync across devices", "warn");
        return;
    }

    setSyncStatus("Syncing...", "sync");

    const { error } = await supabaseClient.from("watch_progress").upsert(
        {
            user_id: user.id,
            progress: saved,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
    );

    if (error) {
        console.error(error);
        setSyncStatus("Sync failed", "warn");
        return;
    }

    setSyncStatus("Synced across devices", "good");
}

async function refreshAuthUi() {
    const user = await getSessionUser();

    if (user) {
        authStatus.textContent = `Signed in as ${user.email}`;
        authStatus.className = "pill good";
        signOutButton.classList.remove("hidden");
    } else {
        authStatus.textContent = "Not signed in • local progress only";
        authStatus.className = "pill sync";
        signOutButton.classList.add("hidden");
    }
}

async function signUp() {
    if (authBusy) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        setSyncStatus("Enter email and password first", "warn");
        return;
    }

    setAuthBusy(true);
    setSyncStatus("Creating account...", "sync");

    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });

        if (error) {
            console.error(error);
            setSyncStatus(error.message, "warn");
            return;
        }

        if (!data.session) {
            setSyncStatus("Account created. Check your email to confirm, then sign in.", "warn");
        } else {
            await refreshAuthUi();
            await loadRemoteProgress();
            await syncToCloud();
        }
    } finally {
        setAuthBusy(false);
    }
}

async function signIn() {
    if (authBusy) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        setSyncStatus("Enter email and password first", "warn");
        return;
    }

    setAuthBusy(true);
    setSyncStatus("Signing in...", "sync");

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            console.error(error);
            setSyncStatus(error.message, "warn");
            return;
        }

        await refreshAuthUi();
        await loadRemoteProgress();
        setSyncStatus("Signed in and synced", "good");
    } finally {
        setAuthBusy(false);
    }
}

async function signOut() {
    if (authBusy) return;

    setAuthBusy(true);

    try {
        const { error } = await supabaseClient.auth.signOut();

        if (error) {
            console.error(error);
            setSyncStatus(error.message, "warn");
            return;
        }

        await refreshAuthUi();
        setSyncStatus("Signed out • local progress kept on this device", "warn");
    } finally {
        setAuthBusy(false);
    }
}

document.getElementById("mark-all-clear").addEventListener("click", async () => {
    replaceLocalProgress({});
    render();
    await syncToCloud();
});

document.getElementById("jump-next").addEventListener("click", () => {
    const next = entries.find((entry) => !Boolean(saved[String(entry.n)] ?? saved[entry.n]));
    if (next) {
        window.open(next.url, "_blank", "noopener,noreferrer");
    }
});

document.getElementById("force-sync").addEventListener("click", async () => {
    await syncToCloud();
});

signUpButton.addEventListener("click", signUp);
signInButton.addEventListener("click", signIn);
signOutButton.addEventListener("click", signOut);

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
        authStatus.textContent = `Signed in as ${session.user.email}`;
        authStatus.className = "pill good";
        signOutButton.classList.remove("hidden");
    }

    if (event === "SIGNED_OUT") {
        authStatus.textContent = "Not signed in • local progress only";
        authStatus.className = "pill sync";
        signOutButton.classList.add("hidden");
    }
});

async function init() {
    await loadEntries();
    await refreshAuthUi();

    const user = await getSessionUser();
    if (user) {
        await loadRemoteProgress();
    } else {
        render();
    }
}

init();
