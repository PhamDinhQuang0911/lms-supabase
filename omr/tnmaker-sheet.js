// TNMaker A5 landscape, measured from the supplied 2479 x 1746 PNG.
// Keep tn40n geometry for previously saved exams and review images.
(function(){
  const p=(x,y)=>[x/100,y/100],m=(ten,x,y,s=30)=>({ten,x:x/100,y:y/100,s:s/100});
  MAU.tnmaker40={ten:'Phiếu ngang – 40 câu A/B/C/D - TNMaker',r:.21,khung:[0,0,24.79,17.46],
    moc:[m('TL',146,143,44),m('TR',2335,143,44),m('BR',2335,1625,44),m('BL',146,1625,44),
      ...[[1686,852],[2085,537],[2085,856],...[254,748,1242,1736,2230].flatMap(x=>[[x,955],[x,1283]]),...[748,1242,1736].map(x=>[x,1605])].map(([x,y],i)=>m('I'+i,x,y))],
    p1:Array.from({length:40},(_,i)=>[420,503,586,668].map(x=>p(x+Math.floor(i/10)*493.5,991+i%10*64.75))),
    p2:[],p3:[],p3hang:[],sbd:[],sbdNhan:[],
    made:[2140,2184,2228,2272].map(x=>Array.from({length:10},(_,i)=>p(x,250+i*63.8))),madeNhan:Array.from({length:10},(_,i)=>String(i))};
})();
