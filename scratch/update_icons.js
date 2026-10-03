const fs = require('fs');
const path = require('path');

const baseDir = 'E:/lms-supabase';

const APPLE_TAGS = `    <!-- Apple Touch Icons cho iPhone & iPad -->
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png">
    <link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon-167.png">
    <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152.png">
    <link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon-120.png">
    <link rel="apple-touch-icon-precomposed" href="/apple-touch-icon-precomposed.png">
    <link rel="icon" type="image/png" href="/apple-touch-icon.png">
    <meta name="apple-mobile-web-app-title" content="Toán Thầy Choang">
    <script>
        window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.deferredInstallPrompt = e;
        });
    </script>`;

const files = [
    'practice.html', 'exam-editor.html', 'course-player.html',
    'course-manager.html', 'book-manager.html', 'homework-player.html',
    'topic-bank.html', 'topic-builder.html', 'dashboard-mapid.html'
];

files.forEach(f => {
    const p = path.join(baseDir, f);
    if (!fs.existsSync(p)) return;
    let text = fs.readFileSync(p, 'utf8');
    if (text.includes('apple-touch-icon-167.png')) {
        console.log('Already updated:', f);
        return;
    }
    if (text.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">')) {
        text = text.replace('<link rel="apple-touch-icon" href="/apple-touch-icon.png">', APPLE_TAGS);
        text = text.replace('<meta name="apple-mobile-web-app-title" content="QMath">', '');
        fs.writeFileSync(p, text, 'utf8');
        console.log('Successfully updated:', f);
    } else {
        console.log('Target string not found in:', f);
    }
});
