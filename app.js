import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging.js";

const firebaseConfig = {
    apiKey: "AIzaSyDupzxrxXlI0XYgu_yuOCP2bCrnkuyvNhc",
    authDomain: "diabetets-mama.firebaseapp.com",
    databaseURL: "https://diabetets-mama-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "diabetets-mama",
    storageBucket: "diabetets-mama.firebasestorage.app",
    messagingSenderId: "627757340126",
    appId: "1:627757340126:web:cd2e55619fac147ec5b94f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const messaging = getMessaging(app);

// Globale Variablen
let globaleSpritzZeit = "20:00";
let aktuelleUserUid = null;

// Medizinische Grenzwerte für Warnungen (mg/dl)
const LIMIT_NIEDRIG = 70;
const LIMIT_HOCH = 180;

// HTML Elemente auslesen
const bzInp = document.getElementById("blutzucker");
const insInp = document.getElementById("insulin");
const speichernBtn = document.getElementById("speichernBtn");
const logTabelle = document.getElementById("logTabelle");
const sidebar = document.getElementById("sidebar");
const openMenuBtn = document.getElementById("openMenuBtn");
const closeMenuBtn = document.getElementById("closeMenuBtn");
const eUhrzeit = document.getElementById("spritzUhrzeit");
const speichernEinstellungenBtn = document.getElementById("speichernEinstellungenBtn");

const pages = {
    logbuch: document.getElementById("pageLogbuch"),
    statistik: document.getElementById("pageStatistik"),
    einstellungen: document.getElementById("pageEinstellungen")
};

// ==========================================
// NAVIGATION
// ==========================================
function zeigeSeite(seitenName) {
    Object.keys(pages).forEach(key => {
        if (key === seitenName) pages[key].classList.add("active");
        else pages[key].classList.remove("active");
    });
    sidebar.classList.remove("open");
}
openMenuBtn.addEventListener("click", () => sidebar.classList.add("open"));
closeMenuBtn.addEventListener("click", () => sidebar.classList.remove("open"));
document.getElementById("navLogbuch").addEventListener("click", () => zeigeSeite("logbuch"));
document.getElementById("navStatistik").addEventListener("click", () => zeigeSeite("statistik"));
document.getElementById("navEinstellungen").addEventListener("click", () => zeigeSeite("einstellungen"));
document.getElementById("zurueckLogbuch1").addEventListener("click", () => zeigeSeite("logbuch"));

// ==========================================
// ANONYME AUTHENTIFIZIERUNG (MIT AUTO-REPARATUR)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        aktuelleUserUid = user.uid;
        console.log("Prüfe Account mit UID:", aktuelleUserUid);
        
        try {
            // Test-Schreiben um zu schauen, ob der Account in Firebase gelöscht wurde
            await set(ref(db, `users/${aktuelleUserUid}/letzter_login`), new Date().toISOString());
            
            console.log("Account ist gültig. Starte Verbindung...");
            starteDatenbankVerbindung(aktuelleUserUid);
            
            // Wenn der Browser bereits die Erlaubnis hat, aktualisieren wir den Banner direkt
            if (Notification.permission === "granted") {
                const banner = document.getElementById("pushBanner");
                if (banner) banner.style.display = "none";
                berechtigungFuerPushAnfordern();
            }
            
        } catch (error) {
            console.warn("⚠️ Alter Account existiert nicht mehr in Firebase! Erstelle neuen...", error);
            await signOut(auth);
            neuenAnonymenUserErstellen();
        }
    } else {
        neuenAnonymenUserErstellen();
    }
});

// Hilfsfunktion zur sauberen Neuregistrierung
function neuenAnonymenUserErstellen() {
    signInAnonymously(auth)
        .then((result) => {
            aktuelleUserUid = result.user.uid;
            console.log("✨ Brandneuer anonymer User erstellt mit UID:", aktuelleUserUid);
            starteDatenbankVerbindung(aktuelleUserUid);
        })
        .catch(error => console.error("Login Fehler bei Neuerstellung:", error));
}

function starteDatenbankVerbindung(uid) {
    // 1. EINSTELLUNGEN LADEN & SPEICHERN
    speichernEinstellungenBtn.addEventListener("click", async () => {
        try {
            await set(ref(db, `users/${uid}/profil_einstellungen`), {
                spritzZeit: eUhrzeit.value,
                w60: document.getElementById("warn60").checked,
                w30: document.getElementById("warn30").checked,
                w15: document.getElementById("warn15").checked,
                w0: document.getElementById("warn0").checked
            });
            globaleSpritzZeit = eUhrzeit.value;
            alert("Einstellungen erfolgreich gespeichert!");
            zeigeSeite("logbuch");
        } catch (e) { console.error(e); }
    });

    onValue(ref(db, `users/${uid}/profil_einstellungen`), (snapshot) => {
        const config = snapshot.val();
        if (config) {
            globaleSpritzZeit = config.spritzZeit || "20:00";
            eUhrzeit.value = globaleSpritzZeit;
            document.getElementById("warn60").checked = config.w60;
            document.getElementById("warn30").checked = config.w30;
            document.getElementById("warn15").checked = config.w15;
            document.getElementById("warn0").checked = config.w0;
        }
    });

    // 2. TAGEBUCH-EINTRÄGE SPEICHERN
    speichernBtn.addEventListener("click", async () => {
        const bz = parseFloat(bzInp.value);
        const ins = parseInt(insInp.value);
        if (!bz || isNaN(ins)) return alert("Bitte beide Felder ausfüllen!");

        // Sofort-Warnung bei kritischen Werten
        if (bz < LIMIT_NIEDRIG) {
            alert(`⚠️ ACHTUNG UNTERZUCKER! Ihr Wert ist mit ${bz} mg/dl sehr niedrig. Bitte schnell Traubenzucker oder Saft geben!`);
        } else if (bz > LIMIT_HOCH) {
            alert(`⚠️ ACHTUNG ÜBERZUCKER! Ihr Wert ist mit ${bz} mg/dl sehr hoch. Bitte Zustand kontrollieren.`);
        }

        try {
            const neuesLogRef = push(ref(db, `users/${uid}/diabetes_logs`));
            await set(neuesLogRef, { blutzucker: bz, insulin: ins, zeitstempel: new Date().toISOString() });
            bzInp.value = ""; insInp.value = "";
        } catch (e) { console.error(e); }
    });

    // DATEN LIVE AUSLESEN, ANZEIGEN & WARNUNGEN FARBLICH KENNZEICHNEN
    onValue(ref(db, `users/${uid}/diabetes_logs`), (snapshot) => {
        logTabelle.innerHTML = "";
        const data = snapshot.val();
        if (data) {
            const eintraege = Object.keys(data).map(k => data[k]).sort((a,b) => new Date(b.zeitstempel) - new Date(a.zeitstempel));
            
            const letzterEintrag = eintraege[0];
            if (letzterEintrag) {
                bzInp.placeholder = `Zuletzt: ${letzterEintrag.blutzucker} mg/dl`;
                document.getElementById("statLetzterWert").textContent = `${letzterEintrag.blutzucker} mg/dl`;
            }

            let gesamtZucker = 0; let maxZucker = 0; let minZucker = 999;

            eintraege.forEach(e => {
                const d = new Date(e.zeitstempel).toLocaleString("de-DE", { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
                
                let zuckerKlasse = "bg-normal";
                if (e.blutzucker < LIMIT_NIEDRIG) {
                    zuckerKlasse = "bg-niedrig";
                } else if (e.blutzucker > LIMIT_HOCH) {
                    zuckerKlasse = "bg-hoch";
                }

                logTabelle.innerHTML += `
                    <tr>
                        <td>${d}</td>
                        <td><span class="${zuckerKlasse}">${e.blutzucker} mg/dl</span></td>
                        <td><span class="badge-insulin">${e.insulin} IE</span></td>
                    </tr>`;
                
                gesamtZucker += e.blutzucker;
                if(e.blutzucker > maxZucker) maxZucker = e.blutzucker;
                if(e.blutzucker < minZucker) minZucker = e.blutzucker;
            });

            document.getElementById("statEintraege").textContent = eintraege.length;
            document.getElementById("statMax").textContent = `${maxZucker} mg/dl`;
            document.getElementById("statMin").textContent = `${minZucker} mg/dl`;
        } else {
            logTabelle.innerHTML = `<tr><td colspan="3" style="text-align:center;">Noch keine Einträge.</td></tr>`;
            bzInp.placeholder = "z.B. 140 mg/dl";
            document.getElementById("statLetzterWert").textContent = "--";
        }
    });
}

// ==========================================
// LIVE-UHR & TIMER 
// ==========================================
function updateClockAndCountdown() {
    const now = new Date();
    document.getElementById('live-clock').textContent = now.toLocaleTimeString('de-DE');
    document.getElementById('live-date').textContent = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

    const [zielStunde, zielMinute] = globaleSpritzZeit.split(":");
    let target = new Date();
    target.setHours(parseInt(zielStunde), parseInt(zielMinute), 0, 0);

    if (now > target) target.setDate(target.getDate() + 1);

    const diffMs = target - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    const countdownText = document.getElementById("countdown-text");
    if (diffHours === 0 && diffMinutes === 0) {
        countdownText.textContent = "Jetzt Insulin spritzen!";
        countdownText.style.color = "var(--secondary)";
    } else {
        countdownText.textContent = `Noch ${diffHours} Std. und ${diffMinutes} Min. bis zur Spritze (${globaleSpritzZeit} Uhr)`;
        countdownText.style.color = "var(--accent)";
    }
}
setInterval(updateClockAndCountdown, 1000);

// ==========================================
// PUSH CONFIG & MANUELLER BUTTON
// ==========================================

// Event-Listener für den Klick auf den Banner-Button
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("pushAktivierenBtn");
    if (btn) {
        btn.addEventListener("click", () => {
            console.log("Button geklickt! Starte Push-Abfrage...");
            berechtigungFuerPushAnfordern();
        });
    }
});

async function berechtigungFuerPushAnfordern() {
    try {
        const permission = await Notification.requestPermission();
        console.log("Berechtigungs-Status:", permission);

        if (permission === "granted") {
            const registration = await navigator.serviceWorker.register("firebase-messaging-sw.js");
            
            const token = await getToken(messaging, { 
                vapidKey: "BJaHk8YgFDxUQ44zQkywM8uXp2GzWUWoc81ovY7GhAs8UVd5qbqA90xQYaw93pHuj68ZrY8AFrQUWMB3a_cMj9k", 
                serviceWorkerRegistration: registration 
            });
            
            if (token && aktuelleUserUid) {
                console.log("Token generiert und wird gespeichert:", token);
                await set(ref(db, `users/${aktuelleUserUid}/push_token`), token);
                console.log("Token erfolgreich in die Firebase-Datenbank hochgeladen!");
                
                // Blendet den Banner aus, da es geklappt hat
                const banner = document.getElementById("pushBanner");
                if (banner) banner.style.display = "none";
                
                alert("🎉 Super! Die Erinnerungen sind jetzt für dieses Handy aktiv.");
            }
        } else if (permission === "denied") {
            alert("⚠️ Benachrichtigungen wurden blockiert. Bitte erlaube sie manuell in den Handy- oder Browser-Einstellungen.");
        }
    } catch (error) { 
        console.error("Fehler beim Push-Setup:", error); 
    }
}
