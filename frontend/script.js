let lat = null, lon = null, active = 0, id = 1001;

function toggleTheme() { document.body.classList.toggle("dark"); }

function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang.value === "hi" ? "hi-IN" : "en-US";
    rec.start();
    rec.onresult = e => desc.value = e.results[0][0].transcript;
}

function previewImage() {
    const f = image.files[0];
    if (f) preview.src = URL.createObjectURL(f);
}

function getLocation() {
    navigator.geolocation.getCurrentPosition(p => {
        lat = p.coords.latitude; lon = p.coords.longitude;
        locationText.innerText = `Location: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    });
}

// note: in the demo this still manipulates a local store; ideally POST to backend
let complaintsDB = {}; // frontend demo DB

// fetch global complaints sorted by verifications and display them
async function loadComplaints() {
    try {
        const res = await fetch('/api/complaints?sort=popular');
        const data = await res.json();
        complaintList.innerHTML = '';
        data.forEach(c => {
            const div = document.createElement('div');
            div.className = 'complaint-card';
            div.innerHTML = `<b>${c.category}</b><br>
ID: ${c.cid}<br>
${c.description || ''}<br>
Verifications: <span class="ver-count">${c.verifications || 0}</span><br>
Status: ${c.status}<br>
<button onclick="verifyDirect('${c._id}', this)">✔ Verify</button>`;
            complaintList.appendChild(div);
        });
    } catch (err) {
        console.error('Failed to load complaints', err);
        complaintList.innerText = 'Unable to load complaints';
    }
}

async function submitComplaint() {
    if (!desc.value || !lat) return alert("Fill all fields!");
    
    active++;
    activeCount.innerText = active;
    id++;
    const cidVal = "CS-" + id;

    const complaintData = {
        cid: cidVal,
        category: category.value,
        description: desc.value,
        lat: lat,
        lon: lon,
        ward: ward.value || "Zone A",
        status: "Submitted",
        priority: "Normal"
    };

    try {
        // Send to backend
        const res = await fetch('/api/complaints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(complaintData)
        });
        const saved = await res.json();
        cid.innerText = "#" + saved.cid;
        alert(`Complaint submitted! ID: ${saved.cid}`);
    } catch (err) {
        console.error('Submit failed:', err);
        // still show it locally even if backend fails
        cid.innerText = "#" + cidVal;
    }

    // local display
    complaintsDB[cidVal] = complaintData;
    const div = document.createElement("div");
    div.className = "complaint-card";
    div.innerHTML = `<b>${category.value}</b><br>
ID: #${cidVal}<br>${desc.value}<br>Status: Submitted`;
    complaintList.appendChild(div);
    desc.value = "";
    preview.src = "";
}

let lastTracked = null;

// simple per‑user check stored in localStorage; prevents duplicate clicks in this browser
function hasVerified(id) {
    return localStorage.getItem(`verified_${id}`) === "1";
}
function markVerified(id) {
    localStorage.setItem(`verified_${id}`, "1");
}

async function trackComplaint() {
    const val = trackId.value.trim();
    if (!val) {
        trackResult.innerText = "Enter an ID to track";
        return;
    }

    // remove leading # if any
    const idToQuery = val.replace(/^#/, "");

    try {
        const res = await fetch(`/api/complaints/${idToQuery}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        lastTracked = data;
        verifyCount = data.verifications || 0;
        document.getElementById("verifyCount").innerText = verifyCount;

        trackResult.innerHTML = `
      <b>Status:</b> ${data.status}<br>
      <b>Category:</b> ${data.category}<br>
      <b>ID:</b> ${data.cid}<br>
      <b>Verifications:</b> ${verifyCount}
    `;
        // disable the verify button if already clicked
        const btn = document.querySelector(".crowd-box button");
        if (btn) btn.disabled = hasVerified(data._id);
    } catch (e) {
        trackResult.innerText = "❌ Complaint not found";
        lastTracked = null;
    }
}
function share(platform) {
    const text = encodeURIComponent("I reported a civic issue via CivicSense. Let's improve our city!");
    let url = "";
    if (platform == "whatsapp") url = `https://wa.me/?text=${text}`;
    if (platform == "x") url = `https://twitter.com/intent/tweet?text=${text}`;
    if (platform == "instagram") alert("Instagram sharing opens camera inside app.");
    if (platform == "threads") window.open("https://www.threads.net");
    if (platform == "youtube") window.open("https://youtube.com");
    window.open(url, "_blank");
}
function toggleDisaster() {
    document.body.classList.toggle("disaster");
    alert("Emergency services activated!");
}
let score = 0;
function addScore() {
    score += 10;
    scoreEl.innerText = score;
}
function startSLA(card) {
    let time = 48 * 60 * 60;
    const t = setInterval(() => {
        time--;
        card.querySelector(".sla").innerText = "SLA: " + Math.floor(time / 3600) + "h";
        if (time <= 0) { card.style.border = "2px solid red"; clearInterval(t); }
    }, 1000);
}
// call loadComplaints after DOM content loaded
window.addEventListener('DOMContentLoaded', loadComplaints);

const ctx = document.getElementById('zoneChart').getContext('2d');
let chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
            label: 'Complaints',
            data: [12, 19, 10, 14, 20, 18, 25],
            borderColor: '#00ffd5',
            backgroundColor: 'rgba(0,255,213,0.2)',
            tension: 0.4,
            fill: true
        }]
    },
    options: {
        responsive: true,
        plugins: {
            legend: { labels: { color: '#00ffd5' } }
        },
        scales: {
            x: { ticks: { color: '#00ffd5' } },
            y: { ticks: { color: '#00ffd5' } }
        }
    }
});

async function verifyDirect(id, btn) {
    if (hasVerified(id)) {
        alert('Already verified');
        btn.disabled = true;
        return;
    }
    try {
        const res = await fetch(`/api/complaints/${id}/verify`, { method: 'PUT' });
        const updated = await res.json();
        // update the span in this card
        const parent = btn.parentElement;
        const span = parent.querySelector('.ver-count');
        if (span) span.innerText = updated.verifications || 0;
        markVerified(id);
        btn.disabled = true;
        alert('Verified!');
    } catch (e) {
        console.error(e);
        alert('Could not verify');
    }
}

function updateZone() {
    const zone = zoneSelect.value;
    const data = {
        "Zone A": [12, 19, 10, 14, 20, 18, 25],
        "Zone B": [5, 8, 6, 9, 12, 10, 15],
        "Zone C": [3, 4, 5, 6, 8, 7, 9]
    };
    chart.data.datasets[0].data = data[zone];
    chart.update();
}
/* ===============================
   🤖 CHATBOT (GEMINI READY)
   =============================== */
function toggleChat() {
    const bot = document.getElementById("chatbot");
    bot.style.display = bot.style.display === "flex" ? "none" : "flex";
}

function addMsg(text, type) {
    const div = document.createElement("div");
    div.className = `chat-msg ${type}`;
    div.innerText = text;
    document.getElementById("chat-body").appendChild(div);
    document.getElementById("chat-body").scrollTop = document.getElementById("chat-body").scrollHeight;
}

async function sendChat() {
    const input = document.getElementById("chatText");
    const msg = input.value.trim();
    if (!msg) return;

    addMsg(msg, "user");
    input.value = "";
    addMsg("Thinking…", "bot");

    try {
        const res = await fetch("http://localhost:5000/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg })
        });

        const data = await res.json();
        chat - body.lastChild.remove();
        addMsg(data.reply, "bot");
    } catch {
        chat - body.lastChild.remove();
        addMsg("AI backend not connected.", "bot");
    }
}
/* ===============================
   🌐 LANGUAGE SWITCH (EN / HI)
   =============================== */

const translations = {
    en: {
        raise: "Raise Complaint",
        category: "Category",
        description: "Description",
        submit: "Submit Complaint",
        track: "Track Complaint",
        disaster: "Disaster Mode",
        active: "Active",
        resolved: "Resolved",
        complaints: "Complaints",
        citizen: "Citizen Score"
    },
    hi: {
        raise: "शिकायत दर्ज करें",
        category: "श्रेणी",
        description: "विवरण",
        submit: "शिकायत भेजें",
        track: "शिकायत ट्रैक करें",
        disaster: "आपदा मोड",
        active: "सक्रिय",
        resolved: "निस्तारित",
        complaints: "शिकायतें",
        citizen: "नागरिक स्कोर"
    }
};

function changeLang() {
    const lang = document.getElementById("lang").value;

    // Section titles
    document.getElementById("tRaise").innerText = translations[lang].raise;

    // Dashboard cards
    document.querySelectorAll(".card h3")[0].innerText = translations[lang].active;
    document.querySelectorAll(".card h3")[1].innerText = translations[lang].resolved;
    document.querySelectorAll(".card h3")[2].innerText = translations[lang].complaints;
    document.querySelectorAll(".card h3")[3].innerText = translations[lang].citizen;

    // Buttons
    document.querySelector(".submit").innerText = translations[lang].submit;
    document.querySelector(".disaster-btn").innerText =
        "🚨 " + translations[lang].disaster;
}
/* ===============================
   🤖 AI SEVERITY LOGIC (DEMO)
   =============================== */

function analyzeSeverity() {
    const text = document.getElementById("desc").value.toLowerCase();
    let level = 20;
    let label = "Low";

    if (text.includes("accident") || text.includes("fire")) {
        level = 90; label = "Critical";
    } else if (text.includes("garbage") || text.includes("water")) {
        level = 60; label = "Medium";
    }

    document.getElementById("severityFill").style.width = level + "%";
    document.getElementById("severityText").innerText =
        "Severity: " + label;
}

document.getElementById("desc")
    .addEventListener("input", analyzeSeverity);
/* ===============================
👥 CROWD VERIFY LOGIC
=============================== */

let verifyCount = 0;

async function verifyIssue() {
    if (!lastTracked || !lastTracked._id) {
        alert("Please track a complaint before verifying.");
        return;
    }
    if (hasVerified(lastTracked._id)) {
        alert("You have already verified this complaint.");
        const btn = document.querySelector(".crowd-box button");
        if (btn) btn.disabled = true;
        return;
    }

    try {
        const res = await fetch(`/api/complaints/${lastTracked._id}/verify`, {
            method: "PUT"
        });
        const updated = await res.json();
        verifyCount = updated.verifications || 0;
        document.getElementById("verifyCount").innerText = verifyCount;
        markVerified(lastTracked._id);
        const btn = document.querySelector(".crowd-box button");
        if (btn) btn.disabled = true;
        alert("Thanks for verifying!");
    } catch (err) {
        console.error(err);
        alert("Failed to verify complaint.");
    }
}
/* ===============================
   SHOW USER EMAIL ON TOP
================================ */

const emailTop = document.getElementById("userEmailTop");

if (emailTop) {
    const email = localStorage.getItem("userEmail");

    if (email) {
        emailTop.innerText = email;
    }
    else {
        emailTop.innerText = "Guest";
    }
}
/* ===============================
   🔐 LOGIN PANEL TOGGLE
================================ */

function openLogin() {
    const panel = document.getElementById("loginPanel");

    if (panel) {
        panel.style.display = "flex";
    }
}

function closeLogin() {
    const panel = document.getElementById("loginPanel");

    if (panel) {
        panel.style.display = "none";
    }
}
function openLogin() {
    document.getElementById("loginPanel").style.display = "flex";
}

function closeLogin() {
    document.getElementById("loginPanel").style.display = "none";
}