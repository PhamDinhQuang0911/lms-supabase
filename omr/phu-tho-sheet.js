// Independent geometry measured on the supplied 1654 × 2339 Phú Thọ sheet.
(function(){
  const p=(x,y)=>[x/100,y/100],m=(ten,x,y)=>({ten,x:x/100,y:y/100,s:.30});
  MAU.phutho={ten:'Phiếu TLTN_HSG_Phú Thọ',r:.102,khung:[0,0,16.54,23.39],
    moc:[m('TL',56,49),m('TR',1597,49),m('BR',1597,2302),m('BL',56,2302),
      ...[677,1088,1355,1830].flatMap((y,i)=>[m('L'+i,56,y),m('R'+i,1597,y)])],
    p1:Array.from({length:50},(_,i)=>[168,224,280,337].map(x=>p(x+Math.floor(i/10)*296.7,756+i%10*32.25))),
    p2:Array.from({length:40},(_,i)=>{const q=Math.floor(i/4),base=Math.floor(q/2)*296.7;return (q%2?[282,332]:[168,218]).map(x=>p(x+base,1202+i%4*34.7))}),
    p3:Array.from({length:12},(_,q)=>{const x=168+q%6*242.7,y=q<6?1441:1914;return Array.from({length:4},(_,col)=>[
      p(x+col*39.8,y),p(x+col*39.8,y+30),
      ...Array.from({length:10},(_,d)=>p(x+col*39.8,y+62+d*31.45))
    ])}),p3hang:['-',',','0','1','2','3','4','5','6','7','8','9'],
    sbd:Array.from({length:8},(_,i)=>Array.from({length:10},(_,d)=>p(1162+i*31.8,221+d*41.7))),sbdNhan:Array.from({length:10},(_,d)=>String(d)),
    made:[1443,1475,1507,1539].map(x=>Array.from({length:10},(_,d)=>p(x,221+d*41.7))),madeNhan:Array.from({length:10},(_,d)=>String(d))};
})();
