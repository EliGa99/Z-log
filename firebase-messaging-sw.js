importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDupzxrxXlI0XYgu_yuOCP2bCrnkuyvNhc",
    authDomain: "diabetets-mama.firebaseapp.com",
    projectId: "diabetets-mama",
    storageBucket: "diabetets-mama.firebasestorage.app",
    messagingSenderId: "627757340126",
    appId: "1:627757340126:web:cd2e55619fac147ec5b94f"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log("Wichtige Nachricht erhalten: ", payload);
    
    const notificationTitle = payload.notification.title || "⚠️ Diabetes Erinnerung";
    
    // Das sind die "WhatsApp-Einstellungen" für maximale Aufmerksamkeit:
    const notificationOptions = {
        body: payload.notification.body || "Zeit für dein Insulin!",
        icon: 'https://img.icons8.com/color/192/pill.png', // Ein großes, klares Icon
        badge: 'https://img.icons8.com/color/96/pill.png', // Kleines Icon für die Statusleiste oben
        
        // VIBRATIONSMUSTER: Vibriert 500ms, wartet 100ms, vibriert 500ms (wie ein echter Anruf/Alarm)
        vibrate: [500, 100, 500, 100, 500],
        
        // PUSH-STUFE: "high" sorgt dafür, dass die Nachricht sofort das Display aufweckt
        priority: "high",
        urgency: "high",
        
        // TAG & RENOFTIFY: Wenn die nächste Warnung kommt, vibriert das Handy erneut,
        // anstatt die alte Nachricht einfach stumm zu aktualisieren.
        tag: 'insulin-alarm',
        renotify: true,
        
        // Lässt die Nachricht auf dem Sperrbildschirm komplett sichtbar (nicht versteckt)
        visibility: "public"
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});