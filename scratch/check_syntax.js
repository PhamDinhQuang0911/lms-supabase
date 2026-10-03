const fs = require('fs');

try {
    const code2 = fs.readFileSync('latex-exporter.js', 'utf8');
    new Function(code2);
    console.log('latex-exporter.js syntax: OK');
} catch (e) {
    console.error('latex-exporter.js error:', e);
}

try {
    const html = fs.readFileSync('dashboard.html', 'utf8');
    const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
    let errCount = 0;
    scripts.forEach((s, idx) => {
        if (s.includes('src=')) return;
        const code = s.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
        try {
            const stripped = code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '/* import */')
                                 .replace(/export\s+default\s+/g, '/* export */')
                                 .replace(/export\s+(?:const|let|var|function|class)\s+/g, '/* export */');
            new Function(stripped);
        } catch (e) {
            console.error(`Script #${idx} error:`, e.message);
            errCount++;
        }
    });
    if (errCount === 0) {
        console.log(`dashboard.html syntax: OK (${scripts.length} scripts tested)`);
    }
} catch (e) {
    console.error('dashboard.html error:', e);
}
try {
    const html = fs.readFileSync('index.html', 'utf8');
    const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
    let errCount = 0;
    scripts.forEach((s, idx) => {
        if (s.includes('src=')) return;
        const code = s.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
        try {
            const stripped = code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '/* import */')
                                 .replace(/export\s+default\s+/g, '/* export */')
                                 .replace(/export\s+(?:const|let|var|function|class)\s+/g, '/* export */');
            new Function(stripped);
        } catch (e) {
            console.error(`index.html Script #${idx} error:`, e.message);
            errCount++;
        }
    });
    if (errCount === 0) {
        console.log(`index.html syntax: OK (${scripts.length} scripts tested)`);
    }
} catch (e) {
    console.error('index.html error:', e);
}
try {
    const html = fs.readFileSync('student.html', 'utf8');
    const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
    let errCount = 0;
    scripts.forEach((s, idx) => {
        if (s.includes('src=')) return;
        const code = s.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
        try {
            const stripped = code.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '/* import */')
                                 .replace(/export\s+default\s+/g, '/* export */')
                                 .replace(/export\s+(?:const|let|var|function|class)\s+/g, '/* export */');
            new Function(stripped);
        } catch (e) {
            console.error(`student.html Script #${idx} error:`, e.message);
            errCount++;
        }
    });
    if (errCount === 0) {
        console.log(`student.html syntax: OK (${scripts.length} scripts tested)`);
    }
} catch (e) {
    console.error('student.html error:', e);
}
try {
    const compat = fs.readFileSync('supabase-db-compat.js', 'utf8');
    const stripped = compat.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '/* import */')
                           .replace(/export\s+default\s+/g, '/* export */')
                           .replace(/export\s+(?:const|let|var|function|class|async\s+function)\s+/g, '/* export */')
                           .replace(/export\s+\{[^}]+\};?/g, '/* export */');
    new Function(stripped);
    console.log('supabase-db-compat.js syntax: OK');
} catch (e) {
    console.error('supabase-db-compat.js error:', e);
}

