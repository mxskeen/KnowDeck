const API = 'http://127.0.0.1:8000';
const $ = (q)=>document.querySelector(q);

let deck = null;
let index = 0;

async function authHeader(){
	try{
		if(window.Clerk){
			const user = window.Clerk.user;
			if(user && user.id) return { 'X-User-Id': user.id };
		}
	}catch(e){}
	return {};
}

async function refreshUsage(){
	const headers = await authHeader();
	try{
		const r = await fetch(`${API}/api/usage`, { headers });
		const j = await r.json();
		$('#usage').textContent = `uses: ${j.used}/${j.limit}`;
	}catch(e){ $('#usage').textContent = 'uses: –/–'; }
}

function render(){
	if(!deck){
		$('#deck').classList.add('hidden');
		$('#empty').style.display='block';
		return;
	}
	$('#deck').classList.remove('hidden');
	$('#empty').style.display='none';
	const s = deck.slides[index];
	$('#slide h2').textContent = s.title;
	$('#slide p').textContent = s.body;
	const img = $('#slide-image');
	if(s.image){ img.src = s.image; img.style.display='block'; } else { img.style.display='none'; }
	const dots = deck.slides.map((_,i)=>`<span class="${i===index?'active':''}"></span>`).join('');
	$('#dots').innerHTML = dots;
	$('#prev').disabled = index===0;
	$('#next').disabled = index===deck.slides.length-1;
}

$('#generate').onclick = async ()=>{
	const topic = $('#topic').value.trim();
	if(!topic) return;
	const level = $('#level').value;
	const headers = Object.assign({'Content-Type':'application/json'}, await authHeader());
	const res = await fetch(`${API}/api/decks`, {method:'POST', headers, body:JSON.stringify({topic, level})});
	if(res.status===429){ alert('Daily limit reached. Sign in for more uses.'); return; }
	deck = await res.json();
	index = 0; render();
	const url = new URL(location.href); url.searchParams.set('id', deck.id); history.replaceState({}, '', url.toString());
	refreshUsage();
}

$('#prev').onclick = ()=>{ if(index>0){ index--; render(); } };
$('#next').onclick = ()=>{ if(deck && index < deck.slides.length-1){ index++; render(); } };

$('#ask').onclick = async ()=>{
	if(!deck) return;
	const q = $('#question').value.trim();
	if(!q) return;
	$('#ask').disabled = true;
	try{
		const headers = Object.assign({'Content-Type':'application/json'}, await authHeader());
		const res = await fetch(`${API}/api/decks/${deck.id}/slides`, { method:'POST', headers, body:JSON.stringify({question:q}) });
		if(res.status===429){ alert('Daily limit reached. Sign in for more uses.'); return; }
		deck = await res.json();
		index = deck.slides.length-1; render();
		refreshUsage();
	} finally { $('#ask').disabled = false; $('#question').value=''; }
}

$('#copylink').onclick = async ()=>{
	if(!deck) return;
	const url = new URL(location.href); url.searchParams.set('id', deck.id);
	await navigator.clipboard.writeText(url.toString());
	$('#copylink').textContent = 'Copied'; setTimeout(()=>$('#copylink').textContent='Copy link', 1200);
}

async function bootstrap(){
	const id = new URL(location.href).searchParams.get('id');
	if(id){
		try{
			const r = await fetch(`${API}/api/decks/${id}`);
			if(r.ok){ deck = await r.json(); index=0; render(); }
		}catch(e){}
	}
	refreshUsage();
}

bootstrap(); 