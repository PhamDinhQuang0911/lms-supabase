(function(root){
  function parseQuickAnswers(text,count){
    const source=String(text).trim().toUpperCase().replace(/^ĐÁP\s*ÁN\s*[:：]?\s*/u,'');
    const matches=[...source.matchAll(/(?:^|[\s,;|])(?:CÂU\s*)?(\d+)\s*(?:[.):=\-]\s*|\s+)([ABCD?\-])(?=$|[\s,;|])/gu)];
    if(matches.length){
      const out=Array(count).fill('-'),seen=new Set();
      let rest=source;
      for(const m of matches){const q=Number(m[1]);if(q<1||q>count)throw Error(`Câu ${q} nằm ngoài số câu của bài thi (${count}).`);if(seen.has(q))throw Error(`Câu ${q} xuất hiện nhiều lần.`);seen.add(q);out[q-1]=m[2];rest=rest.replace(m[0],' ')}
      if(rest.replace(/[\s,;|]+/g,''))throw Error('Có nội dung chưa đọc được. Dùng dạng 1.A 2.B hoặc chuỗi ABCD.');
      return {answers:out.join(''),count:seen.size};
    }
    const clean=source.replace(/[\s,;|.]+/g,'');
    if(/[^ABCD?\-]/.test(clean))throw Error('Chỉ nhập A/B/C/D, hoặc dạng 1.A 2.B.');
    if(clean.length>count)throw Error(`Có ${clean.length} đáp án, bài thi chỉ có ${count} câu.`);
    return {answers:clean.padEnd(count,'-'),count:clean.length};
  }
  root.parseQuickAnswers=parseQuickAnswers;
  if(typeof module!=='undefined')module.exports=parseQuickAnswers;
})(typeof window==='undefined'?globalThis:window);
