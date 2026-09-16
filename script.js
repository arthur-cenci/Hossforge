// Captured as early as possible so the JS-driven stats (layer count, time remaining,
// progress bar) stay phase-locked with the SVG SMIL animation, which starts its own
// clock the moment the SVG markup is parsed (just before this script runs).
const PRINT_ANIM_START = Date.now();

// ---------------- State (in-memory only) ----------------
const CATEGORIES = ["Decoração","Utilidades","Miniaturas","Organização","Acessórios","Brinquedo","Anti-estresse"];
let products = [
  {
    id: 1,
    name: "Espada Retrátil",
    cats: ["Brinquedo"],
    price: 69.90,
    stock: 15,
    material: "PLA",
    thickness: "0.2mm",
    time: "6h",
    img: "",
    desc: "Espada de brinquedo com lâmina retrátil, mecanismo interno articulado e acabamento liso, sem partes cortantes.",
  },
  {
    id: 2,
    name: "Suporte de Fone Articulado",
    cats: ["Utilidades", "Acessórios"],
    price: 49.90,
    stock: 8,
    material: "PETG",
    thickness: "0.16mm",
    time: "3h",
    img: "",
    desc: "Suporte de mesa para headset com base antiderrapante e braço articulado.",
  },
  {
    id: 3,
    name: "Miniatura Dragão RPG",
    cats: ["Miniaturas", "Brinquedo"],
    price: 34.90,
    stock: 20,
    material: "Resina",
    thickness: "0.1mm",
    time: "4h",
    img: "",
    desc: "Miniatura de 32mm em alta resolução para mesas de RPG, ideal para pintar.",
  },
];
let nextProductId = 4;
let filaments = ["PLA","PETG","ABS","Resina","TPU"];
let thicknesses = ["0.1mm","0.16mm","0.2mm","0.28mm"];
let pendingProduct = null;
let editingProductId = null;
let pendingProductImageData = "";
let cart = []; // {id, qty}
let customOrders = [];
let nextTicket = 1001;
let activeFilter = "Todos";
let searchTerm = "";

// ---------------- Auth (demo-only, client-side gate) ----------------
// NOTE: this is a UI-level gate for this single-file demo, not real security.
// A production store needs server-side authentication to truly protect this data.
const STORE_CREDENTIALS = { user: "admin", pass: "hossforge" };
// TODO (lojista): troque pelo número real do WhatsApp da loja, com DDI+DDD, só números.
const WHATSAPP_NUMBER = "5511999999999";
let isLoggedIn = false;

// ---------------- Placeholder image (layered-object SVG) ----------------
function placeholderImg(seed){
  const hues = ["#d4a537","#4a9eea","#6fae6a","#d0645a"];
  const c = hues[seed % hues.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 150'>
    <rect width='200' height='150' fill='#141b30'/>
    <g fill='none' stroke='${c}' stroke-width='1.3' opacity='0.85'>
      ${[0,1,2,3,4,5].map(i=>`<ellipse cx='100' cy='${115-i*13}' rx='${46-i*3}' ry='9' />`).join('')}
    </g>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// ---------------- Rendering: Store ----------------
function renderFilters(){
  const cats = ["Todos", ...CATEGORIES.filter(c => products.some(p => p.cats.includes(c)))];
  const wrap = document.getElementById('filterChips');
  wrap.innerHTML = cats.map(c=>`<button class="chip ${c===activeFilter?'active':''}" data-cat="${c}">${c}</button>`).join('');
  wrap.querySelectorAll('.chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{ activeFilter = btn.dataset.cat; renderFilters(); renderGrid(); });
  });
}

function stockNote(stock){
  if(stock<=0) return `<span class="stock-note stock-out">Esgotado</span>`;
  if(stock<=3) return `<span class="stock-note stock-low">Últimas ${stock} unidades</span>`;
  return `<span class="stock-note stock-ok">${stock} em estoque</span>`;
}

function renderGrid(){
  const grid = document.getElementById('productGrid');
  let list = products.filter(p => activeFilter==="Todos" || p.cats.includes(activeFilter));
  if(searchTerm.trim()){
    const s = searchTerm.trim().toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(s) || p.desc.toLowerCase().includes(s));
  }
  if(products.length===0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Nenhum produto cadastrado ainda. Acesse a Área do lojista para adicionar o primeiro item ao catálogo.</div>`;
    return;
  }
  if(list.length===0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Nenhum produto encontrado.</div>`;
    return;
  }
  grid.innerHTML = list.map(p=>`
    <div class="card" data-card="${p.id}">
      <div class="card-corner cc-tl"></div><div class="card-corner cc-br"></div>
      <div class="card-media">
        <img src="${p.img || placeholderImg(p.id)}" alt="${p.name}" onerror="this.src='${placeholderImg(p.id)}'">
        <div class="card-cat mono">${p.cats.join(' · ')}</div>
      </div>
      <div class="card-body">
        <h3>${p.name}</h3>
        <div class="desc">${p.desc || ''}</div>
        <div class="card-meta"><span>${p.material}</span><span>·</span><span>${p.thickness}</span><span>·</span><span>${p.time || '—'}</span></div>
        ${stockNote(p.stock)}
        <div class="card-foot">
          <span class="price">R$ ${p.price.toFixed(2).replace('.',',')}</span>
          <button class="add-btn" data-add="${p.id}" ${p.stock<=0?'disabled style="opacity:.4; cursor:not-allowed;"':''}>${p.stock<=0?'Esgotado':'Adicionar'}</button>
        </div>
      </div>
    </div>
  `).join('');
  grid.querySelectorAll('[data-add]:not([disabled])').forEach(btn=>{
    btn.addEventListener('click', ()=> addToCart(parseInt(btn.dataset.add), btn));
  });
}

// ---------------- Cart ----------------
function addToCart(id, sourceBtn){
  const product = products.find(p=>p.id===id);
  if(!product || product.stock<=0){ showToast("Produto esgotado."); return; }
  const existing = cart.find(c=>c.id===id);
  const currentQty = existing ? existing.qty : 0;
  if(currentQty >= product.stock){ showToast("Você já adicionou todo o estoque disponível."); return; }
  if(existing) existing.qty++;
  else cart.push({id, qty:1});
  renderCart();
  if(sourceBtn) flyToCart(sourceBtn);
}
function changeQty(id, delta){
  const item = cart.find(c=>c.id===id);
  const product = products.find(p=>p.id===id);
  if(!item) return;
  if(delta>0 && product && item.qty >= product.stock){
    showToast("Estoque máximo já está no carrinho.");
    return;
  }
  item.qty += delta;
  if(item.qty<=0) cart = cart.filter(c=>c.id!==id);
  renderCart();
}
function removeFromCart(id){
  cart = cart.filter(c=>c.id!==id);
  renderCart();
}
function renderCart(){
  const wrap = document.getElementById('cartItems');
  const countEl = document.getElementById('cartCount');
  const subtotalEl = document.getElementById('cartSubtotal');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const totalQty = cart.reduce((a,c)=>a+c.qty,0);
  countEl.textContent = totalQty;
  checkoutBtn.disabled = cart.length===0;

  if(cart.length===0){
    wrap.innerHTML = `<div class="empty-state">Seu carrinho está vazio.</div>`;
    subtotalEl.textContent = "R$ 0,00";
    return;
  }
  let subtotal = 0;
  wrap.innerHTML = cart.map(c=>{
    const p = products.find(pr=>pr.id===c.id);
    if(!p) return '';
    subtotal += p.price * c.qty;
    return `
      <div class="cart-row">
        <img src="${p.img || placeholderImg(p.id)}" onerror="this.src='${placeholderImg(p.id)}'">
        <div class="cart-row-info">
          <h4>${p.name}</h4>
          <div class="qty-ctrl">
            <button data-dec="${p.id}">−</button>
            <span>${c.qty}</span>
            <button data-inc="${p.id}">+</button>
          </div>
          <button class="remove-link" data-rm="${p.id}">Remover</button>
        </div>
        <div class="cart-row-price mono">R$ ${(p.price*c.qty).toFixed(2).replace('.',',')}</div>
      </div>`;
  }).join('');
  subtotalEl.textContent = "R$ " + subtotal.toFixed(2).replace('.',',');

  wrap.querySelectorAll('[data-inc]').forEach(b=>b.addEventListener('click',()=>changeQty(parseInt(b.dataset.inc),1)));
  wrap.querySelectorAll('[data-dec]').forEach(b=>b.addEventListener('click',()=>changeQty(parseInt(b.dataset.dec),-1)));
  wrap.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click',()=>removeFromCart(parseInt(b.dataset.rm))));
}

function openDrawer(){ document.getElementById('drawer').classList.add('show'); document.getElementById('overlay').classList.add('show'); }
function closeDrawer(){ document.getElementById('drawer').classList.remove('show'); document.getElementById('overlay').classList.remove('show'); }

// ---------------- Fly-to-cart animation ----------------
function flyToCart(sourceBtn){
  const card = sourceBtn.closest('.card');
  const img = card ? card.querySelector('.card-media img') : null;
  const cartIcon = document.getElementById('openCart');
  if(!img || !cartIcon) return;

  const startRect = img.getBoundingClientRect();
  const endRect = cartIcon.getBoundingClientRect();

  const clone = img.cloneNode(true);
  clone.style.position = 'fixed';
  clone.style.left = startRect.left + 'px';
  clone.style.top = startRect.top + 'px';
  clone.style.width = startRect.width + 'px';
  clone.style.height = startRect.height + 'px';
  clone.style.objectFit = 'cover';
  clone.style.borderRadius = '3px';
  clone.style.border = '1px solid var(--ember)';
  clone.style.zIndex = '200';
  clone.style.pointerEvents = 'none';
  clone.style.transition = 'left .55s cubic-bezier(.5,-0.2,.85,.35), top .55s cubic-bezier(.5,-0.2,.85,.35), transform .55s cubic-bezier(.5,-0.2,.85,.35), opacity .55s ease .1s';
  document.body.appendChild(clone);

  const scale = 0.15;
  const endX = endRect.left + endRect.width/2 - (startRect.width*scale)/2;
  const endY = endRect.top + endRect.height/2 - (startRect.height*scale)/2;

  requestAnimationFrame(()=>{
    clone.style.left = endX + 'px';
    clone.style.top = endY + 'px';
    clone.style.transform = `scale(${scale})`;
    clone.style.opacity = '0.25';
  });

  setTimeout(()=>{
    clone.remove();
    cartIcon.classList.add('cart-bump');
    setTimeout(()=>cartIcon.classList.remove('cart-bump'), 260);
  }, 560);
}

document.getElementById('openCart').addEventListener('click', openDrawer);
document.getElementById('closeCart').addEventListener('click', closeDrawer);
document.getElementById('overlay').addEventListener('click', closeDrawer);

document.getElementById('checkoutBtn').addEventListener('click', ()=>{
  const ticket = "HF-" + (nextTicket++);
  const total = cart.reduce((a,c)=>{
    const p = products.find(pr=>pr.id===c.id); return a + (p?p.price*c.qty:0);
  },0);
  cart.forEach(c=>{
    const p = products.find(pr=>pr.id===c.id);
    if(p) p.stock = Math.max(0, p.stock - c.qty);
  });
  cart = [];
  renderCart();
  renderGrid();
  renderAdminProducts();
  renderCustomMaterialOptions();
  closeDrawer();
  showModal("✓", "Pedido confirmado", `Seu pedido de R$ ${total.toFixed(2).replace('.',',')} foi registrado. Em uma loja real, aqui entraria pagamento e envio.`, ticket);
});

// ---------------- Search ----------------
document.getElementById('searchInput').addEventListener('input', (e)=>{
  searchTerm = e.target.value; renderGrid();
});

// ---------------- Nav / views ----------------
function goToView(viewName){
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.view===viewName));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+viewName).classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});
}
function attachNavHandlers(){
  document.querySelectorAll('nav.tabs button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(btn.dataset.view === 'admin' && !isLoggedIn){
        openLogin();
        return;
      }
      goToView(btn.dataset.view);
    });
  });
}

// ---------------- Auth ----------------
function renderNav(){
  const nav = document.getElementById('navTabs');
  nav.innerHTML = `
    <button data-view="store">Loja</button>
    <button data-view="custom">Pedido personalizado</button>
    ${isLoggedIn ? '<button data-view="admin">Área do lojista</button>' : ''}
  `;
  // keep whichever view is currently visible active in the tab bar
  const currentView = document.querySelector('.view.active')?.id.replace('view-','') || 'store';
  const target = (currentView==='admin' && !isLoggedIn) ? 'store' : currentView;
  attachNavHandlers();
  goToView(target);

  const loginBtn = document.getElementById('loginBtn');
  if(isLoggedIn){
    loginBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Sair`;
  } else {
    loginBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Entrar`;
  }
}

function openLogin(){
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('lg_user').classList.remove('field-error');
  document.getElementById('lg_pass').classList.remove('field-error');
  document.getElementById('lg_user').value = '';
  document.getElementById('lg_pass').value = '';
  document.getElementById('loginOverlay').classList.add('show');
  document.getElementById('lg_user').focus();
}
function closeLogin(){ document.getElementById('loginOverlay').classList.remove('show'); }

document.getElementById('loginBtn').addEventListener('click', ()=>{
  if(isLoggedIn){
    isLoggedIn = false;
    renderNav();
    showToast("Você saiu da área do lojista.");
  } else {
    openLogin();
  }
});
document.getElementById('loginCancel').addEventListener('click', closeLogin);
document.getElementById('loginOverlay').addEventListener('click', (e)=>{ if(e.target.id==='loginOverlay') closeLogin(); });

// Login is handled on a plain button click (not native form submission) so it
// can't be silently blocked by browser field-validation quirks in any browser.
function attemptLogin(){
  const u = document.getElementById('lg_user').value.trim();
  const p = document.getElementById('lg_pass').value.trim();
  const errEl = document.getElementById('loginError');
  const userEl = document.getElementById('lg_user');
  const passEl = document.getElementById('lg_pass');
  const modalEl = document.querySelector('#loginOverlay .modal');

  if(!u || !p){
    errEl.textContent = "Preencha usuário e senha.";
    errEl.style.display = 'block';
    if(!u) userEl.classList.add('field-error');
    if(!p) passEl.classList.add('field-error');
    modalEl.classList.remove('shake'); void modalEl.offsetWidth; modalEl.classList.add('shake');
    return;
  }

  if(u===STORE_CREDENTIALS.user && p===STORE_CREDENTIALS.pass){
    isLoggedIn = true;
    closeLogin();
    renderNav();
    goToView('admin');
    showToast("Bem-vindo(a) de volta.");
  } else {
    errEl.textContent = "Usuário ou senha incorretos.";
    errEl.style.display = 'block';
    userEl.classList.add('field-error');
    passEl.classList.add('field-error');
    modalEl.classList.remove('shake'); void modalEl.offsetWidth; modalEl.classList.add('shake');
    showToast("Usuário ou senha incorretos.");
  }
}
window.attemptLogin = attemptLogin; // safety net, callable even if addEventListener below ever fails to attach

document.getElementById('loginSubmit').addEventListener('click', attemptLogin);
['lg_user','lg_pass'].forEach(id=>{
  const el = document.getElementById(id);
  el.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); attemptLogin(); }
  });
  el.addEventListener('input', ()=> el.classList.remove('field-error'));
});

document.querySelectorAll('.admin-tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.admin-tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.admin-view').forEach(v=>v.classList.remove('active'));
    document.getElementById('admin-'+btn.dataset.admin).classList.add('active');
  });
});

// ---------------- Admin: products ----------------
function renderCategoryChecks(){
  const wrap = document.getElementById('p_cat_checks');
  wrap.innerHTML = CATEGORIES.map((c,i)=>`
    <label class="cat-check" id="catlbl_${i}">
      <input type="checkbox" value="${c}" data-catcheck="${i}"> ${c}
    </label>
  `).join('');
  wrap.querySelectorAll('input[data-catcheck]').forEach(input=>{
    input.addEventListener('change', ()=>{
      document.getElementById('catlbl_'+input.dataset.catcheck).classList.toggle('checked', input.checked);
    });
  });
}

// ---------------- Store: materials panel ----------------
function renderStoreMaterials(){
  const panel = document.getElementById('materialsPanel');
  const filPills = filaments.length
    ? filaments.map(f=>`<span class="info-pill gold">${f}</span>`).join('')
    : `<span class="materials-empty">Nenhum filamento cadastrado ainda.</span>`;
  const thickPills = thicknesses.length
    ? thicknesses.map(t=>`<span class="info-pill blue">${t}</span>`).join('')
    : `<span class="materials-empty">Nenhuma espessura cadastrada ainda.</span>`;
  panel.innerHTML = `
    <div class="materials-row"><span class="row-label">Filamentos disponíveis</span>${filPills}</div>
    <div class="materials-row"><span class="row-label">Espessuras de camada</span>${thickPills}</div>
  `;
}

function renderMaterialSelects(){
  const matSel = document.getElementById('p_material');
  const prevMat = matSel.value;
  matSel.innerHTML = filaments.length
    ? filaments.map(f=>`<option ${f===prevMat?'selected':''}>${f}</option>`).join('')
    : `<option value="">Cadastre um filamento primeiro</option>`;

  const thickSel = document.getElementById('p_thickness');
  const prevThick = thickSel.value;
  thickSel.innerHTML = thicknesses.length
    ? thicknesses.map(t=>`<option ${t===prevThick?'selected':''}>${t}</option>`).join('')
    : `<option value="">Cadastre uma espessura primeiro</option>`;
}

// ---- Filaments & thicknesses management ----
function renderFilamentList(){
  const wrap = document.getElementById('filamentList');
  wrap.innerHTML = filaments.length
    ? filaments.map((f,i)=>`<span class="tag-pill">${f}<button data-rmfil="${i}" type="button">&times;</button></span>`).join('')
    : `<span class="tag-empty">Nenhum filamento cadastrado ainda.</span>`;
  wrap.querySelectorAll('[data-rmfil]').forEach(b=>{
    b.addEventListener('click', ()=>{
      filaments.splice(parseInt(b.dataset.rmfil),1);
      renderFilamentList(); renderMaterialSelects(); renderStoreMaterials(); renderCustomMaterialOptions();
    });
  });
}
function renderThicknessList(){
  const wrap = document.getElementById('thicknessList');
  wrap.innerHTML = thicknesses.length
    ? thicknesses.map((t,i)=>`<span class="tag-pill">${t}<button data-rmthick="${i}" type="button">&times;</button></span>`).join('')
    : `<span class="tag-empty">Nenhuma espessura cadastrada ainda.</span>`;
  wrap.querySelectorAll('[data-rmthick]').forEach(b=>{
    b.addEventListener('click', ()=>{
      thicknesses.splice(parseInt(b.dataset.rmthick),1);
      renderThicknessList(); renderMaterialSelects(); renderStoreMaterials();
    });
  });
}
document.getElementById('filamentForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const input = document.getElementById('fil_input');
  const val = input.value.trim();
  if(!val){ return; }
  if(filaments.some(f=>f.toLowerCase()===val.toLowerCase())){ showToast("Esse filamento já está cadastrado."); return; }
  filaments.push(val);
  input.value = '';
  renderFilamentList(); renderMaterialSelects(); renderStoreMaterials(); renderCustomMaterialOptions();
  showToast("Filamento adicionado.");
});
document.getElementById('thicknessForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const input = document.getElementById('thick_input');
  const val = input.value.trim();
  if(!val){ return; }
  if(thicknesses.some(t=>t.toLowerCase()===val.toLowerCase())){ showToast("Essa espessura já está cadastrada."); return; }
  thicknesses.push(val);
  input.value = '';
  renderThicknessList(); renderMaterialSelects(); renderStoreMaterials();
  showToast("Espessura adicionada.");
});

// ---- Photo picker (gallery / files) ----
function setPhotoPreview(dataUrl){
  const img = document.getElementById('p_img_preview');
  const placeholder = document.getElementById('p_img_preview_placeholder');
  const removeBtn = document.getElementById('p_img_remove');
  if(dataUrl){
    img.src = dataUrl;
    img.style.display = 'block';
    placeholder.style.display = 'none';
    removeBtn.style.display = 'inline-flex';
  } else {
    img.src = '';
    img.style.display = 'none';
    placeholder.style.display = 'block';
    removeBtn.style.display = 'none';
  }
}
document.getElementById('p_img_file').addEventListener('change', (e)=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ showToast("Escolha um arquivo de imagem."); return; }
  const reader = new FileReader();
  reader.onload = ()=>{
    pendingProductImageData = reader.result;
    setPhotoPreview(pendingProductImageData);
  };
  reader.onerror = ()=> showToast("Não foi possível ler essa imagem.");
  reader.readAsDataURL(file);
});
document.getElementById('p_img_remove').addEventListener('click', ()=>{
  pendingProductImageData = "";
  document.getElementById('p_img_file').value = "";
  setPhotoPreview("");
});

// ---- Add / edit product with confirmation step ----
document.getElementById('productForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const name = document.getElementById('p_name').value.trim();
  const price = parseFloat(document.getElementById('p_price').value);
  const stock = parseInt(document.getElementById('p_stock').value);
  const cats = Array.from(document.querySelectorAll('#p_cat_checks input:checked')).map(i=>i.value);
  const material = document.getElementById('p_material').value;
  const thickness = document.getElementById('p_thickness').value;
  if(!name || isNaN(price)){ showToast("Preencha nome e preço."); return; }
  if(cats.length===0){ showToast("Selecione ao menos uma categoria."); return; }
  if(isNaN(stock) || stock<0){ showToast("Informe a quantidade em estoque."); return; }
  if(!material){ showToast("Cadastre e selecione um filamento."); return; }
  if(!thickness){ showToast("Cadastre e selecione uma espessura."); return; }

  pendingProduct = {
    name, price, stock, cats, material, thickness,
    time: document.getElementById('p_time').value.trim(),
    img: pendingProductImageData,
    desc: document.getElementById('p_desc').value.trim(),
    editId: editingProductId,
  };
  showProductConfirm(pendingProduct);
});

function showProductConfirm(p){
  document.getElementById('productConfirmTitle').textContent = p.editId ? "Confirmar alterações" : "Confirmar novo produto";
  document.getElementById('productConfirmOk').textContent = p.editId ? "Salvar alterações" : "Confirmar e adicionar";
  const summary = document.getElementById('productConfirmSummary');
  summary.innerHTML = `
    ${p.img ? `<div style="margin-bottom:10px;"><img src="${p.img}" style="width:64px; height:64px; object-fit:cover; border-radius:2px; border:1px solid var(--line);"></div>` : ''}
    <div><strong style="color:var(--ember);">Nome:</strong> ${p.name}</div>
    <div><strong style="color:var(--ember);">Categorias:</strong> ${p.cats.join(', ')}</div>
    <div><strong style="color:var(--ember);">Filamento:</strong> ${p.material}</div>
    <div><strong style="color:var(--ember);">Espessura:</strong> ${p.thickness}</div>
    <div><strong style="color:var(--ember);">Quantidade em estoque:</strong> ${p.stock}</div>
    <div><strong style="color:var(--ember);">Preço:</strong> R$ ${p.price.toFixed(2).replace('.',',')}</div>
    ${p.time ? `<div><strong style="color:var(--ember);">Tempo de impressão:</strong> ${p.time}</div>` : ''}
    ${p.desc ? `<div><strong style="color:var(--ember);">Descrição:</strong> ${p.desc}</div>` : ''}
  `;
  document.getElementById('productConfirmOverlay').classList.add('show');
}
document.getElementById('productConfirmCancel').addEventListener('click', ()=>{
  document.getElementById('productConfirmOverlay').classList.remove('show');
});
document.getElementById('productConfirmOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='productConfirmOverlay') document.getElementById('productConfirmOverlay').classList.remove('show');
});
document.getElementById('productConfirmOk').addEventListener('click', ()=>{
  if(!pendingProduct) return;
  if(pendingProduct.editId){
    const idx = products.findIndex(p=>p.id===pendingProduct.editId);
    if(idx !== -1){
      const { editId, ...fields } = pendingProduct;
      products[idx] = { ...products[idx], ...fields };
    }
    showToast("Produto atualizado.");
  } else {
    const { editId, ...fields } = pendingProduct;
    products.push({ id: nextProductId++, ...fields });
    showToast("Produto adicionado ao catálogo.");
  }
  pendingProduct = null;
  exitEditMode();
  document.getElementById('productConfirmOverlay').classList.remove('show');
  renderCategoryChecks();
  renderMaterialSelects();
  renderFilters(); renderGrid(); renderAdminProducts();
  renderCustomMaterialOptions();
});

function enterEditMode(product){
  editingProductId = product.id;
  document.getElementById('productFormHeading').textContent = "Editar produto";
  document.getElementById('productFormSubmitBtn').textContent = "Salvar alterações";
  document.getElementById('productFormCancelEdit').style.display = 'inline-flex';

  document.getElementById('p_name').value = product.name;
  document.querySelectorAll('#p_cat_checks input').forEach(input=>{
    const checked = product.cats.includes(input.value);
    input.checked = checked;
    input.closest('label').classList.toggle('checked', checked);
  });
  document.getElementById('p_price').value = product.price;
  document.getElementById('p_stock').value = product.stock;
  document.getElementById('p_material').value = product.material;
  document.getElementById('p_thickness').value = product.thickness;
  document.getElementById('p_time').value = product.time || '';
  document.getElementById('p_desc').value = product.desc || '';
  pendingProductImageData = product.img || '';
  setPhotoPreview(pendingProductImageData);

  const adminSection = document.getElementById('admin-products');
  if(adminSection && typeof adminSection.scrollIntoView === 'function'){
    adminSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
function exitEditMode(){
  editingProductId = null;
  pendingProductImageData = "";
  document.getElementById('productFormHeading').textContent = "Adicionar novo produto";
  document.getElementById('productFormSubmitBtn').textContent = "Adicionar ao catálogo";
  document.getElementById('productFormCancelEdit').style.display = 'none';
  document.getElementById('productForm').reset();
  document.getElementById('p_img_file').value = "";
  setPhotoPreview("");
  document.querySelectorAll('#p_cat_checks label').forEach(l=>l.classList.remove('checked'));
}
document.getElementById('productFormCancelEdit').addEventListener('click', exitEditMode);

function renderAdminProducts(){
  const tbody = document.getElementById('adminProductTable');
  if(products.length===0){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Nenhum produto cadastrado ainda.</td></tr>`;
    return;
  }
  tbody.innerHTML = products.map(p=>`
    <tr>
      <td><img class="row-thumb" src="${p.img || placeholderImg(p.id)}" onerror="this.src='${placeholderImg(p.id)}'"></td>
      <td>${p.name}</td>
      <td style="max-width:160px;">${p.cats.join(', ')}</td>
      <td>${p.material}</td>
      <td>${p.thickness}</td>
      <td class="num">R$ ${p.price.toFixed(2).replace('.',',')}</td>
      <td class="num">${p.stock}</td>
      <td style="display:flex; gap:6px;">
        <button class="btn-ghost" data-edit="${p.id}" style="padding:6px 10px; font-size:12px;">Editar</button>
        <button class="del-btn" data-del="${p.id}">Remover</button>
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-edit]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const product = products.find(p=>p.id === parseInt(b.dataset.edit));
      if(product) enterEditMode(product);
    });
  });
  tbody.querySelectorAll('[data-del]').forEach(b=>{
    b.addEventListener('click', ()=>{
      products = products.filter(p=>p.id !== parseInt(b.dataset.del));
      cart = cart.filter(c=>c.id !== parseInt(b.dataset.del));
      if(editingProductId === parseInt(b.dataset.del)) exitEditMode();
      renderFilters(); renderGrid(); renderAdminProducts(); renderCart();
      renderCustomMaterialOptions();
      showToast("Produto removido.");
    });
  });
}

// ---------------- Custom order form ----------------
function renderCustomMaterialOptions(){
  const sel = document.getElementById('co_material');
  if(!sel) return;
  const prev = sel.value;
  const options = filaments.length
    ? filaments.map(m=>`<option>${m}</option>`).join('')
    : `<option value="">Nenhum filamento cadastrado no momento</option>`;
  sel.innerHTML = options + `<option>Não sei / preciso de indicação</option>`;
  if([...sel.options].some(o=>o.value===prev)) sel.value = prev;
}

document.getElementById('customForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const name = document.getElementById('co_name').value.trim();
  const email = document.getElementById('co_email').value.trim();
  const desc = document.getElementById('co_desc').value.trim();
  if(!name || !email || !desc){ showToast("Preencha nome, e-mail e descrição."); return; }
  const fileInput = document.getElementById('co_file');
  const fileName = fileInput.files && fileInput.files[0] ? fileInput.files[0].name : "—";

  const ticket = "PZ-" + (nextTicket++);
  const order = {
    ticket, name, email,
    phone: document.getElementById('co_phone').value.trim(),
    desc, material: document.getElementById('co_material').value,
    qty: document.getElementById('co_qty').value,
    dims: document.getElementById('co_dims').value.trim(),
    file: fileName,
    status: "Validando",
  };
  customOrders.unshift(order);
  e.target.reset();
  renderAdminOrders();
  showCustomOrderConfirm(order);
});

function buildCustomOrderMessage(o){
  return [
    "Olá! Gostaria de conversar sobre um orçamento de peça personalizada na HossForge.",
    "",
    `Nº do ticket: ${o.ticket}`,
    `Nome: ${o.name}`,
    `Descrição da peça: ${o.desc}`,
    `Material desejado: ${o.material}`,
    `Quantidade: ${o.qty || 1}`,
    `Dimensões aproximadas: ${o.dims || "Não especificadas"}`,
  ].join("\n");
}

function showCustomOrderConfirm(order){
  const message = buildCustomOrderMessage(order);
  document.getElementById('customOrderTicket').textContent = "Nº do ticket: " + order.ticket;
  document.getElementById('customOrderMessage').value = message;
  document.getElementById('customOrderWhatsappBtn').href =
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  document.getElementById('customOrderConfirmOverlay').classList.add('show');
}
function closeCustomOrderConfirm(){
  document.getElementById('customOrderConfirmOverlay').classList.remove('show');
}
document.getElementById('customOrderCloseBtn').addEventListener('click', closeCustomOrderConfirm);
document.getElementById('customOrderConfirmOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='customOrderConfirmOverlay') closeCustomOrderConfirm();
});
document.getElementById('customOrderCopyBtn').addEventListener('click', async ()=>{
  const textarea = document.getElementById('customOrderMessage');
  try{
    await navigator.clipboard.writeText(textarea.value);
    showToast("Mensagem copiada!");
  } catch(err){
    textarea.select();
    document.execCommand('copy');
    showToast("Mensagem copiada!");
  }
});

function renderAdminOrders(){
  const tbody = document.getElementById('adminOrdersTable');
  document.getElementById('ordersBadge').textContent = customOrders.length ? `(${customOrders.length})` : '';
  if(customOrders.length===0){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Nenhum pedido personalizado recebido ainda.</td></tr>`;
    return;
  }
  tbody.innerHTML = customOrders.map(o=>`
    <tr>
      <td class="mono">${o.ticket}</td>
      <td>${o.name}<br><span style="color:var(--text-dim); font-size:11.5px;">${o.email}</span></td>
      <td style="max-width:260px;">${o.desc}</td>
      <td>${o.material}</td>
      <td>${o.dims || '—'}</td>
      <td>
        <select class="status-select" data-status="${o.ticket}">
          <option ${o.status==="Validando"?"selected":""}>Validando</option>
          <option ${o.status==="Em andamento"?"selected":""}>Em andamento</option>
          <option ${o.status==="Concluído"?"selected":""}>Concluído</option>
        </select>
      </td>
      <td>${o.status==="Concluído" ? `<button class="del-btn" data-delorder="${o.ticket}">Excluir</button>` : ''}</td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-status]').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const order = customOrders.find(o=>o.ticket===sel.dataset.status);
      if(order) order.status = sel.value;
      renderAdminOrders();
    });
  });
  tbody.querySelectorAll('[data-delorder]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      customOrders = customOrders.filter(o=>o.ticket !== btn.dataset.delorder);
      renderAdminOrders();
      showToast("Pedido excluído.");
    });
  });
}

// ---------------- Toast & modal ----------------
let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2400);
}
function showModal(mark, title, text, ticket){
  document.getElementById('modalMark').textContent = mark;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalText').textContent = text;
  document.getElementById('modalTicket').textContent = "Nº do ticket: " + ticket;
  document.getElementById('modalOverlay').classList.add('show');
}
document.getElementById('modalClose').addEventListener('click', ()=>{
  document.getElementById('modalOverlay').classList.remove('show');
});

// ---------------- Printer animation status strip ----------------
const PRINT_TOTAL_LAYERS = 64;
const PRINT_TOTAL_MINUTES = 205; // ~3h25 total estimated print time (illustrative)
const PRINT_CYCLE_MS = 6000; // matches the SVG animation duration
const PRINT_GROWTH_FRACTION = 0.55; // fraction of the cycle spent building layers (matches SVG timing)
const MATERIAL_TEMPS = {
  "PLA": { nozzle: 205, bed: 60 },
  "PETG": { nozzle: 230, bed: 80 },
  "ABS": { nozzle: 245, bed: 100 },
  "TPU": { nozzle: 225, bed: 50 },
  "Resina": { nozzle: "—", bed: "—" },
};
function tickPrinterStats(){
  const layerEl = document.getElementById('statLayer');
  const timeEl = document.getElementById('statTime');
  const nozzleEl = document.getElementById('statNozzleTemp');
  const bedEl = document.getElementById('statBedTemp');
  const fillEl = document.getElementById('printerProgressFill');
  if(!layerEl || !fillEl) return;

  const t = (Date.now() - PRINT_ANIM_START) % PRINT_CYCLE_MS;
  const progress = Math.min(1, t / (PRINT_CYCLE_MS * PRINT_GROWTH_FRACTION));
  const layer = Math.max(1, Math.round(progress * PRINT_TOTAL_LAYERS));
  const remainingMin = Math.max(0, Math.round(PRINT_TOTAL_MINUTES * (1 - progress)));
  const h = Math.floor(remainingMin / 60), m = remainingMin % 60;

  layerEl.textContent = `${String(layer).padStart(3,'0')}/${PRINT_TOTAL_LAYERS}`;
  fillEl.style.width = (progress * 100).toFixed(0) + "%";
  timeEl.textContent = remainingMin <= 0 ? "Finalizando..." : `${h > 0 ? h + "h " : ""}${m}min`;

  const currentFilament = filaments.length ? filaments[0] : "PLA";
  const matchedKey = Object.keys(MATERIAL_TEMPS).find(k => currentFilament.toUpperCase().includes(k.toUpperCase()));
  const temps = MATERIAL_TEMPS[matchedKey] || MATERIAL_TEMPS["PLA"];
  nozzleEl.textContent = temps.nozzle === "—" ? "—" : `${temps.nozzle} °C`;
  bedEl.textContent = temps.bed === "—" ? "—" : `${temps.bed} °C`;
}
setInterval(tickPrinterStats, 300);

// ---------------- Footer WhatsApp CTA ----------------
const footerWhatsappBtn = document.getElementById('footerWhatsappBtn');
if(footerWhatsappBtn){
  const genericMsg = "Olá! Vi a loja da HossForge e gostaria de tirar uma dúvida.";
  footerWhatsappBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(genericMsg)}`;
}

// ---------------- Init ----------------
renderCategoryChecks();
renderMaterialSelects();
renderFilamentList();
renderThicknessList();
renderStoreMaterials();
renderFilters();
renderGrid();
renderCart();
renderAdminProducts();
renderAdminOrders();
renderCustomMaterialOptions();
tickPrinterStats();
renderNav();