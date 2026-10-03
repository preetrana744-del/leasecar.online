const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => new Intl.NumberFormat('en-IN').format(n);
const grid = $('#fleetGrid');
const dialog = $('#bookingDialog');
let fleet = [];

window.addEventListener('load', () => {
  if (window.gsap) gsap.to('#pageLoader',{autoAlpha:0,duration:.65,delay:.15,ease:'power2.inOut',onComplete:()=>$('#pageLoader')?.remove()});
  else $('#pageLoader')?.remove();
});

document.addEventListener('pointermove', e => {
  document.documentElement.style.setProperty('--mx', `${e.clientX}px`); document.documentElement.style.setProperty('--my', `${e.clientY}px`);
  const g = $('#cursorGlow'); if (g) { g.style.left = `${e.clientX}px`; g.style.top = `${e.clientY}px`; }
});

async function loadFleet(){
  try{
    const res = await fetch('/api/cars',{headers:{Accept:'application/json'}}); if(!res.ok) throw new Error('Fleet unavailable');
    ({cars:fleet}=await res.json()); renderFleet();
  }catch(err){ grid.innerHTML='<div class="fleet-loading">Fleet could not be loaded. Please refresh.</div>'; }
}
function renderFleet(){
  grid.innerHTML=fleet.map((c,i)=>`<article class="car-card" data-id="${c.id}">
    <img class="car-img" src="${escapeAttr(c.image_url)}" alt="${escapeAttr(c.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity='.2'" />
    <div class="car-shade"></div><div class="car-top"><span class="availability">AVAILABLE</span><span class="car-index">0${i+1}</span></div>
    <div class="car-info"><div><h3>${escapeHtml(c.name)}</h3><div class="rate"><strong>₹${money(c.daily_price)}</strong> / day</div></div><button class="reserve-btn" aria-label="Reserve ${escapeAttr(c.name)}" data-reserve="${c.id}">↗</button></div>
  </article>`).join('');
  initTilts(); initScrollReveal();
  $$('[data-reserve]').forEach(b=>b.addEventListener('click',()=>openBooking(Number(b.dataset.reserve))));
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escapeAttr(s){return escapeHtml(s)}
function initTilts(){
  if(matchMedia('(pointer:coarse)').matches) return;
  $$('.car-card').forEach(card=>{
    card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;card.style.transform=`perspective(1000px) rotateX(${-y*4}deg) rotateY(${x*5}deg) translateY(-2px)`});
    card.addEventListener('pointerleave',()=>card.style.transform='');
  });
}
function initScrollReveal(){
  if(!window.gsap) return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.utils.toArray('.car-card').forEach((el,i)=>gsap.fromTo(el,{y:70,opacity:0},{y:0,opacity:1,duration:.9,delay:(i%2)*.06,ease:'power3.out',scrollTrigger:{trigger:el,start:'top 88%'}}));
}
function openBooking(id){
  const car=fleet.find(c=>c.id===id); if(!car)return;
  $('#bookingCarId').value=id; $('#bookingCar').textContent=car.name; $('#bookingRate').textContent=`Current rate: ₹${money(car.daily_price)} per day`;
  const today=new Date(); const iso=today.toISOString().slice(0,10); $('#startDate').min=iso; $('#endDate').min=iso; $('#bookingStatus').textContent=''; dialog.showModal();
}
$('#closeBooking').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
$('#startDate').addEventListener('change',e=>{ $('#endDate').min=e.target.value; if($('#endDate').value<e.target.value) $('#endDate').value=e.target.value; });
$('#bookingForm').addEventListener('submit',async e=>{
  e.preventDefault(); const btn=e.currentTarget.querySelector('button[type=submit]'),status=$('#bookingStatus'); btn.disabled=true; status.textContent='Sending…';
  const payload={carId:Number($('#bookingCarId').value),name:$('#customerName').value,phone:$('#customerPhone').value,email:$('#customerEmail').value,startDate:$('#startDate').value,endDate:$('#endDate').value,message:$('#bookingMessage').value};
  try{const res=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not send request');status.textContent='✓ Request received. LeaseCar.online can now review it from the admin dashboard.';e.currentTarget.reset();setTimeout(()=>dialog.close(),1800)}catch(err){status.textContent=err.message}finally{btn.disabled=false}
});

if(window.gsap){
  gsap.registerPlugin(ScrollTrigger); gsap.from('.nav',{y:-30,opacity:0,duration:.7,delay:.4});
  gsap.from('.hero .reveal',{y:34,opacity:0,stagger:.09,duration:.9,ease:'power3.out',delay:.3});
  gsap.to('.hero-copy',{y:-70,scrollTrigger:{trigger:'.hero',start:'top top',end:'bottom top',scrub:true}});
  gsap.utils.toArray('.experience-card').forEach((el,i)=>gsap.from(el,{y:50,opacity:0,duration:.8,delay:i*.08,scrollTrigger:{trigger:el,start:'top 90%'}}));
}

async function initThree(){
  try{
    const THREE=await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js');
    const canvas=$('#heroCanvas'); const scene=new THREE.Scene(); const camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.1,100); camera.position.set(0.2,1.1,8.4);
    const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.8)); renderer.setSize(innerWidth,innerHeight); renderer.outputColorSpace=THREE.SRGBColorSpace;
    const car=new THREE.Group(); const dark=new THREE.MeshPhysicalMaterial({color:0x111821,metalness:.85,roughness:.24,clearcoat:1,clearcoatRoughness:.12}); const glass=new THREE.MeshPhysicalMaterial({color:0x7f99a8,metalness:.1,roughness:.05,transmission:.28,transparent:true,opacity:.72}); const tire=new THREE.MeshStandardMaterial({color:0x050608,roughness:.8}); const rim=new THREE.MeshStandardMaterial({color:0x9aa5ae,metalness:.92,roughness:.18});
    const body=new THREE.Mesh(new THREE.BoxGeometry(4.4,1.05,1.82,8,3,3),dark); body.geometry.translate(0,.35,0); body.scale.set(1,1,.96); car.add(body);
    const hood=new THREE.Mesh(new THREE.BoxGeometry(1.3,.42,1.7,5,2,2),dark); hood.position.set(1.55,1.02,0); hood.rotation.z=-.07; car.add(hood);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(2.25,.95,1.56,5,3,3),glass); cabin.position.set(-.45,1.3,0); cabin.rotation.z=-.03; car.add(cabin);
    const frontGlass=new THREE.Mesh(new THREE.PlaneGeometry(1.45,.66),glass); frontGlass.position.set(.56,1.48,.79); frontGlass.rotation.y=0; frontGlass.rotation.z=-.43; car.add(frontGlass);
    for(const x of [-1.45,1.43]) for(const z of [-.88,.88]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.52,.52,.36,32),tire);w.rotation.x=Math.PI/2;w.position.set(x,.12,z);car.add(w);const r=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.38,12),rim);r.rotation.x=Math.PI/2;r.position.copy(w.position);car.add(r)}
    const grille=new THREE.Mesh(new THREE.BoxGeometry(.14,.44,1.22),rim); grille.position.set(2.25,.55,0); car.add(grille);
    const lightMat=new THREE.MeshBasicMaterial({color:0xd6ff3f}); for(const z of [-.57,.57]){const l=new THREE.Mesh(new THREE.BoxGeometry(.08,.16,.38),lightMat);l.position.set(2.34,.78,z);car.add(l)}
    car.rotation.y=-.42; car.rotation.x=.03; car.position.set(2.9,-.1,0); scene.add(car);
    scene.add(new THREE.HemisphereLight(0xcce8ff,0x080808,2.4)); const key=new THREE.DirectionalLight(0xd6ff3f,3.2);key.position.set(4,6,4);scene.add(key);const fill=new THREE.PointLight(0x6df4ff,14,12);fill.position.set(-2,1,4);scene.add(fill);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(3.3,64),new THREE.MeshBasicMaterial({color:0xd6ff3f,transparent:true,opacity:.06,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.set(2.8,-.46,0);scene.add(floor);
    const starsGeo=new THREE.BufferGeometry();const pts=[];for(let i=0;i<900;i++)pts.push((Math.random()-.5)*24,(Math.random()-.5)*14,(Math.random()-.5)*12);starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));const stars=new THREE.Points(starsGeo,new THREE.PointsMaterial({color:0x89939f,size:.016,transparent:true,opacity:.48}));scene.add(stars);
    $('.fallback-car').style.opacity='0'; let tx=0,ty=0; addEventListener('pointermove',e=>{tx=(e.clientX/innerWidth-.5)*.28;ty=(e.clientY/innerHeight-.5)*.13});
    function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight); if(innerWidth<900){car.position.x=1.2;car.scale.setScalar(.75)}else{car.position.x=2.9;car.scale.setScalar(1)}} addEventListener('resize',resize);resize();
    const clock=new THREE.Clock();function tick(){const t=clock.getElapsedTime();car.rotation.y+=((-.42+tx)-car.rotation.y)*.045;car.rotation.x+=(ty-car.rotation.x)*.04;car.position.y=-.05+Math.sin(t*.8)*.045;stars.rotation.y=t*.006;renderer.render(scene,camera);requestAnimationFrame(tick)}tick();
  }catch(err){console.warn('3D engine unavailable, using CSS fallback.',err)}
}
loadFleet(); initThree();
