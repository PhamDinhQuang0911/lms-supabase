// Bộ phân tích dùng lại quy ước TeX của Sách Số Hóa.
// Tách riêng để Xưởng Chuyên Đề có cùng cách đọc câu hỏi và tài nguyên hình.

export function extractBracesAfterCommand(text, command, numBraces, startIndex = 0) {
    const originalCommandIdx = text.indexOf(command, startIndex);
    if (originalCommandIdx === -1) return { found: false, contents: [] };
    let currentIdx = originalCommandIdx + command.length;
    const results = [];

    for (let count = 0; count < numBraces; count++) {
        while (currentIdx < text.length && /[\s%]/.test(text[currentIdx])) {
            if (text[currentIdx] === '%') while (currentIdx < text.length && text[currentIdx] !== '\n') currentIdx++;
            else currentIdx++;
        }
        if (count === 0 && text[currentIdx] === '[') {
            let depth = 1;
            currentIdx++;
            while (currentIdx < text.length && depth) {
                if (text[currentIdx] === '[') depth++;
                else if (text[currentIdx] === ']') depth--;
                currentIdx++;
            }
            while (currentIdx < text.length && /\s/.test(text[currentIdx])) currentIdx++;
        }
        if (text[currentIdx] !== '{') break;
        const contentStart = ++currentIdx;
        let depth = 1;
        while (currentIdx < text.length && depth) {
            if (text[currentIdx] === '\\' && (text[currentIdx + 1] === '{' || text[currentIdx + 1] === '}')) {
                currentIdx += 2;
                continue;
            }
            if (text[currentIdx] === '{') depth++;
            else if (text[currentIdx] === '}') depth--;
            currentIdx++;
        }
        if (depth) break;
        results.push(text.slice(contentStart, currentIdx - 1));
    }
    return { found: results.length === numBraces, contents: results, startIndex: originalCommandIdx, endIndex: currentIdx };
}

export function extractBookSolution(raw) {
    const marker = raw.lastIndexOf('\\loigiai');
    if (marker < 0) return { content: raw.trim(), solution: '' };
    const parsed = extractBracesAfterCommand(raw, '\\loigiai', 1, marker);
    if (!parsed.found) return { content: raw.trim(), solution: '' };
    return {
        content: (raw.slice(0, parsed.startIndex) + raw.slice(parsed.endIndex)).trim(),
        solution: parsed.contents[0].trim()
    };
}

function safeAttr(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function assetPlaceholder(asset) {
    const icon = asset.type === 'tikz' ? 'fa-shapes' : 'fa-image';
    const label = asset.type === 'tikz' ? 'TikZ đang chờ chuyển thành hình' : `Cần ảnh: ${asset.originalPath}`;
    return `<div data-topic-asset="${asset.id}" tabindex="0" class="topic-asset-pending my-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 px-4 py-3 text-center text-sm font-bold text-indigo-700" ondblclick="document.getElementById('topic-image-${asset.id}')?.click()" title="Bấm đúp để chọn ảnh thay thế"><i class="fa-solid ${icon} mr-2"></i>${label}<input id="topic-image-${asset.id}" class="hidden" type="file" accept="image/*" onchange="window.topicUploadPendingImage('${asset.id}', this)"></div>`;
}

export function postProcessBookTex(source, registerAsset) {
    if (!source) return '';
    let processed = String(source)
        .replace(/(?<!\\)%.*$/gm, '')
        .replace(/\\displaystyle\s*/g, '')
        .replace(/\\allowdisplaybreaks\s*/g, '')
        .replace(/\\ldots/g, '...')
        .replace(/\\hfill/g, '<span class="inline-block w-6"></span>');

    processed = processed.replace(/\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\s*\}/g, (_match, _align, content) => {
        const rows = content.split(/\\\\/).map((row) => row.replace(/\\hline/g, '').trim()).filter(Boolean);
        return `<div class="overflow-x-auto my-3"><table class="mx-auto border-collapse border border-gray-300 bg-white">${rows.map((row) => `<tr>${row.split('&').map((cell) => `<td class="border border-gray-300 px-3 py-2 text-center">${cell.trim()}</td>`).join('')}</tr>`).join('')}</table></div>`;
    });

    let color;
    while ((color = extractBracesAfterCommand(processed, '\\textcolor', 2)).found) {
        processed = processed.slice(0, color.startIndex) + color.contents[1] + processed.slice(color.endIndex);
    }

    // Hỗ trợ cả \immini{...}{...} và \immini[thm]{...}{...} như Sách Số Hóa.
    let immini;
    while ((immini = extractBracesAfterCommand(processed, '\\immini', 2)).found) {
        const replacement = `<div class="topic-immini-flow text-justify"><div class="topic-immini-side">${immini.contents[1]}</div>${immini.contents[0]}<div class="clear-both"></div></div>`;
        processed = processed.slice(0, immini.startIndex) + replacement + processed.slice(immini.endIndex);
    }

    processed = processed.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g, (_match, originalPath) => {
        const asset = registerAsset({ type: 'image', originalPath: originalPath.trim(), contentCode: '' });
        return assetPlaceholder(asset);
    });

    processed = processed.replace(/\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g, (match) => {
        const asset = registerAsset({ type: 'tikz', originalPath: 'Hình TikZ', contentCode: match });
        return assetPlaceholder(asset);
    });

    const replaceWrapped = (command, tag) => {
        let parsed;
        while ((parsed = extractBracesAfterCommand(processed, command, 1)).found) {
            processed = processed.slice(0, parsed.startIndex) + `<${tag}>${parsed.contents[0]}</${tag}>` + processed.slice(parsed.endIndex);
        }
    };
    replaceWrapped('\\textbf', 'strong');
    replaceWrapped('\\textit', 'em');

    processed = processed
        .replace(/\\begin\{itemize\}/g, '<ul class="list-disc pl-6 my-2 space-y-1">')
        .replace(/\\end\{itemize\s*\}/g, '</ul>')
        .replace(/\\begin\{(?:enumerate|enumEX|listEX)\}(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, '<ol class="list-decimal pl-6 my-2 space-y-1">')
        .replace(/\\end\{(?:enumerate|enumEX|listEX)\s*\}/g, '</ol>')
        .replace(/\\itemch\b/g, '<li>')
        .replace(/\\item\b/g, '<li>')
        .replace(/\\begin\{center\}/g, '<div class="text-center flex justify-center flex-col items-center">')
        .replace(/\\end\{center\}/g, '</div>')
        .replace(/\\begin\{multicols\}\{\d+\}/g, '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">')
        .replace(/\\end\{multicols\}/g, '</div>')
        .replace(/\\(?:hspace|vspace)\*?\{[^}]*\}/g, '')
        .replace(/\\(?:noindent|medskip|strut)\b/g, '');

    return processed.trim();
}

function extractFirstCommand(text, commands, braces) {
    for (const command of commands) {
        const parsed = extractBracesAfterCommand(text, command, braces);
        if (parsed.found) return { ...parsed, command };
    }
    return null;
}

export function parseBookTexItems(source, makeId) {
    const items = [];
    const assets = [];
    const registerAsset = (data) => {
        const asset = { id: makeId(), ...data, _done: false };
        assets.push(asset);
        return asset;
    };
    const envPattern = /\\begin\{(ex|bt|baitap|vd|vidu)\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{\1\}/gi;
    let match;
    while ((match = envPattern.exec(source))) {
        const env = match[1].toLowerCase();
        const extracted = extractBookSolution(match[2].trim());
        let content = extracted.content;
        let questionKind = env === 'vd' || env === 'vidu' ? 'example' : (env === 'bt' || env === 'baitap' ? 'essay' : 'mc');
        let options = [];
        let correct = [];
        let answer = '';

        const tf = extractFirstCommand(content, ['\\choiceTFt', '\\choiceTFn', '\\choiceTF'], 4);
        if (tf) {
            questionKind = 'tf';
            options = tf.contents.map((option, index) => {
                const isCorrect = /\\True\b/.test(option);
                if (isCorrect) correct.push(index);
                return postProcessBookTex(option.replace(/\\True\b/g, '').trim(), registerAsset);
            });
            content = content.slice(0, tf.startIndex) + content.slice(tf.endIndex);
        } else {
            const short = extractFirstCommand(content, ['\\shortans'], 1);
            if (short) {
                questionKind = 'short';
                answer = postProcessBookTex(short.contents[0], registerAsset);
                content = content.slice(0, short.startIndex) + content.slice(short.endIndex);
            } else {
                const choice = extractFirstCommand(content, ['\\choice'], 4);
                if (choice) {
                    questionKind = 'mc';
                    options = choice.contents.map((option, index) => {
                        const isCorrect = /\\True\b/.test(option);
                        if (isCorrect) correct.push(index);
                        return postProcessBookTex(option.replace(/\\True\b/g, '').trim(), registerAsset);
                    });
                    content = content.slice(0, choice.startIndex) + content.slice(choice.endIndex);
                } else if (questionKind === 'mc') questionKind = 'essay';
            }
        }

        items.push({
            id: makeId(),
            type: questionKind === 'example' ? 'tex-example' : 'tex-question',
            questionKind,
            content: postProcessBookTex(content, registerAsset),
            options,
            correct,
            answer,
            solution: postProcessBookTex(extracted.solution, registerAsset)
        });
    }
    return { items, assets };
}

export function normalizeTexAssetName(path) {
    return String(path || '').replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
}
