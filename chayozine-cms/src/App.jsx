import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── ErrorBoundary ───────────────────────────────────────────────────────────
class ModalErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e) { console.error("Modal error:", e); }
  render() {
    if (this.state.error) return (
      <div style={{padding:"24px",color:"#a05040",fontSize:13,lineHeight:1.8}}>
        <div style={{fontWeight:600,marginBottom:8}}>エラーが発生しました</div>
        <div style={{opacity:.7}}>{this.state.error.message}</div>
        <button onClick={()=>this.setState({error:null})}
          style={{marginTop:12,padding:"6px 16px",background:"#1c1510",color:"#f5f0e8",
            border:"none",borderRadius:6,cursor:"pointer",fontSize:12}}>
          閉じる
        </button>
      </div>
    );
    return this.props.children;
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────
const TEA_TYPES = [
  { label:"緑茶",        color:"#5c7a4e", bg:"#eaf2e5", border:"#b8d4aa" },
  { label:"白茶",        color:"#7a6e5e", bg:"#f5f0e8", border:"#d4c8b4" },
  { label:"青茶（烏龍）", color:"#3a6e7a", bg:"#e4f0f2", border:"#a0ccd4" },
  { label:"紅茶",        color:"#8a3a2e", bg:"#f5e8e4", border:"#d4a89a" },
  { label:"黒茶（普洱）", color:"#3a2820", bg:"#ede8e2", border:"#b4a090" },
  { label:"黄茶",        color:"#7a6010", bg:"#f5f0d8", border:"#d4c070" },
  { label:"花茶",        color:"#7a3a60", bg:"#f5e4f0", border:"#d4a0c0" },
  { label:"茶外茶",      color:"#4a5a6a", bg:"#e8eef2", border:"#a0b4c4" },
];
const MONTH_JA = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"];
const MONTH_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const TEA_TABS = ["基本情報","淹れ方①","淹れ方②","試飲記録","ストーリー","基本画像"];
const NAV_SECTIONS = [
  { label: "雑誌編集", items: [
    { id:"cover",      label:"表紙",        en:"Cover Images",    icon:"🎨" },
    { id:"preface",    label:"ごあいさつ",   en:"Preface",         icon:"✍️" },
    { id:"teas",       label:"月間茶帳",    en:"Tea Catalog",     icon:"🫖" },
    { id:"hiroko",     label:"茶左右記",    en:"荒田博子コラム",   icon:"🍃" },
    { id:"pilgrimage", label:"茶景巡礼",    en:"カンちゃんコラム", icon:"🗾" },
    { id:"report",     label:"活動レポート", en:"先月の活動",       icon:"📸" },
    { id:"events",     label:"活動予告",    en:"今月のイベント",   icon:"📅" },
    { id:"guest",      label:"ゲストコラム", en:"Guest Column",     icon:"👤" },
    { id:"other",      label:"その他",       en:"Others",           icon:"📋" },
    { id:"gift",       label:"ギフト",      en:"Monthly Gift",    icon:"🎁" },
  ]},
  { label: "茶葉", items: [
    { id:"library",    label:"茶葉資料庫",  en:"Tea Library",     icon:"📚" },
  ]},
];
const NAV = NAV_SECTIONS.flatMap(s => s.items);

// ─── Storage (Supabase) ──────────────────────────────────────────────────────
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_KEY;
const SUPA_H = {
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Content-Type": "application/json",
};
const sk = (id, y, m) => `chayozine-${id}:${y}-${String(m).padStart(2,"0")}`;
const LIBRARY_KEY = "tea-library";
let _libCache = null; // session cache
const loadLibrary = async (force=false) => {
  if (_libCache && !force) return _libCache;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/magazine_data?id=eq.${LIBRARY_KEY}&select=value`, { headers: SUPA_H });
    const rows = await r.json();
    _libCache = rows[0] ? JSON.parse(rows[0].value) : [];
    return _libCache;
  } catch { return _libCache || []; }
};
const saveLibrary = async (teas) => {
  _libCache = teas; // update cache immediately
  await fetch(`${SUPA_URL}/rest/v1/magazine_data`, {
    method: "POST", headers: { ...SUPA_H, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ id: LIBRARY_KEY, value: JSON.stringify(teas), updated_at: new Date().toISOString() }),
  });
};
const isRefMode = d => d && !Array.isArray(d) && d.mode === "refs";
const loadS = async (id, y, m) => {
  try {
    const key = sk(id, y, m);
    const res = await fetch(
      `${SUPA_URL}/rest/v1/magazine_data?id=eq.${encodeURIComponent(key)}&select=value`,
      { headers: SUPA_H }
    );
    const rows = await res.json();
    return rows[0] ? JSON.parse(rows[0].value) : null;
  } catch { return null; }
};
const saveS = async (id, y, m, d) => {
  const key = sk(id, y, m);
  await fetch(`${SUPA_URL}/rest/v1/magazine_data`, {
    method: "POST",
    headers: { ...SUPA_H, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ id: key, value: JSON.stringify(d), updated_at: new Date().toISOString() }),
  });
};

// ─── Image compress ───────────────────────────────────────────────────────────
const compressImg = (file, maxW=1400) => new Promise(res => {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      res(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ─── Storage upload (images go to Supabase Storage, not the database) ───────
const STORAGE_BUCKET = "tea-images";
const dataUrlToBlob = (dataUrl) => {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};
const uploadToStorage = async (dataUrl) => {
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${filename}`, {
    method: "POST",
    headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": blob.type },
    body: blob,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return `${SUPA_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`;
};
// Compress then upload — returns a small URL string instead of huge base64
const processImage = async (file, maxW=1400) => {
  const dataUrl = await compressImg(file, maxW);
  try { return await uploadToStorage(dataUrl); }
  catch { return dataUrl; } // fallback: keep base64 if storage fails
};

// ─── Tea helpers ──────────────────────────────────────────────────────────────
const mkTea = () => ({ id: Date.now().toString(), No:"", 分類:"緑茶", 場所:"", 名前:"", ひながら:"", 収穫日:"", 説明:"", おやつ:"",
  基本画像:[], 丁寧編:{茶器:"",投茶量:"",水温:"",手順:""}, クイック編:{HOT:"",COLD:""}, 試飲記録:[], ストーリー:{内容:"",画像:[]} });
const tInfo = label => TEA_TYPES.find(t => t.label === label) || TEA_TYPES[0];

// Normalize legacy tea data to current schema
const normalizeTea = (t) => ({
  ...mkTea(),
  ...t,
  No: t.No || "",
  基本画像: Array.isArray(t.基本画像) ? t.基本画像 : [],
  試飲記録: Array.isArray(t.試飲記録) ? t.試飲記録 : [],
  丁寧編: t.丁寧編 || {茶器:"",投茶量:"",水温:"",手順:""},
  クイック編: t.クイック編 || {HOT:"",COLD:""},
  ストーリー: {
    内容: t.ストーリー?.内容 || "",
    画像: Array.isArray(t.ストーリー?.画像)
      ? t.ストーリー.画像
      : (t.ストーリー?.画像 ? [{id:"legacy",src:t.ストーリー.画像,caption:""}] : []),
  },
});

// ─── Shared styles ────────────────────────────────────────────────────────────
const FI = { width:"100%", padding:"9px 12px", border:"1px solid #e0d8cc", borderRadius:6, fontSize:14,
  background:"#fff8f2", color:"#1c1510", outline:"none", fontFamily:"inherit" };
const LBL = { fontSize:11, letterSpacing:2, textTransform:"uppercase", color:"#8a7060", marginBottom:6, display:"block" };
const SBOX = { background:"#fff", border:"1px solid #ede8de", borderRadius:10, padding:"20px 22px",
  display:"flex", flexDirection:"column", gap:18 };

// ─── PhotoGallery ─────────────────────────────────────────────────────────────
function PhotoGallery({ images=[], onChange, showCaption=true }) {
  const ref = useRef();
  const [uploading, setUploading] = useState(false);
  const addFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    setUploading(true);
    const newImgs = await Promise.all(files.map(async f => ({
      id: Date.now() + Math.random().toString(36).slice(2),
      src: await processImage(f), caption: ""
    })));
    setUploading(false);
    onChange([...images, ...newImgs]);
    e.target.value = "";
  };
  const del = id => onChange(images.filter(i => i.id !== id));
  const setCap = (id, cap) => onChange(images.map(i => i.id === id ? {...i, caption:cap} : i));

  return (
    <div>
      <div style={LBL}>画像</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:10 }}>
        {images.map(img => (
          <div key={img.id} style={{ borderRadius:8, overflow:"hidden", border:"1px solid #e8e0d0", background:"#fff" }}>
            <div style={{ position:"relative" }}>
              <img src={img.src} alt="" style={{ width:"100%", height:140, objectFit:"cover", display:"block" }} />
              <button onClick={() => del(img.id)} style={{ position:"absolute", top:6, right:6,
                background:"#1c151099", color:"#f5f0e8", width:24, height:24, borderRadius:"50%",
                fontSize:14, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                ×
              </button>
            </div>
            {showCaption && (
              <input placeholder="キャプション…" value={img.caption} onChange={e => setCap(img.id, e.target.value)}
                style={{ width:"100%", padding:"6px 8px", fontSize:12, border:"none", borderTop:"1px solid #ede8de",
                  background:"#faf6ee", color:"#4a3a2a", outline:"none", fontFamily:"inherit" }} />
            )}
          </div>
        ))}
        <div onClick={() => ref.current?.click()} style={{ border:"1.5px dashed #c9b070", borderRadius:8,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          gap:8, minHeight:140, cursor:"pointer", transition:"background .2s" }}
          onMouseOver={e=>e.currentTarget.style.background="#f5eedc"}
          onMouseOut={e=>e.currentTarget.style.background="transparent"}>
          <div style={{ fontSize:26, color:"#c9b070" }}>{uploading?"⏳":"＋"}</div>
          <div style={{ fontSize:11, color:"#8a7060", letterSpacing:1 }}>{uploading?"アップロード中…":"画像を追加"}</div>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={addFiles} />
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom:28 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:3, height:28, background:"#b89a5c", borderRadius:2 }} />
        <h2 style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:30, fontWeight:300,
          fontStyle:"italic", color:"#1c1510", margin:0 }}>{title}</h2>
      </div>
      {subtitle && <div style={{ fontSize:12, color:"#8a7060", letterSpacing:2, marginTop:4, marginLeft:15 }}>{subtitle}</div>}
    </div>
  );
}

// ─── SaveBar ──────────────────────────────────────────────────────────────────
function SaveBar({ onSave, saving }) {
  return (
    <div style={{ marginTop:32, paddingTop:20, borderTop:"1px solid #ede8de", display:"flex", justifyContent:"flex-end" }}>
      <button disabled={saving} onClick={onSave} style={{ background:"#1c1510", color:"#f5f0e8",
        borderRadius:7, padding:"11px 32px", fontSize:13, letterSpacing:2, fontWeight:600,
        border:"none", cursor:saving?"not-allowed":"pointer", opacity:saving?0.5:1 }}>
        {saving ? "保存中…" : "保存する"}
      </button>
    </div>
  );
}

// ─── CoverSection ─────────────────────────────────────────────────────────────
function CoverSection({ year, month, notify }) {
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [coverTitle, setCoverTitle] = useState("");
  useEffect(() => { loadS("cover",year,month).then(d => { setImages(d?.images||[]); setCoverTitle(d?.title||""); }); }, [year,month]);
  const save = async () => { setSaving(true); await saveS("cover",year,month,{images, title:coverTitle}); setSaving(false); notify("保存しました ✓"); };
  return (
    <div>
      <SectionHeader title="表紙" subtitle="Cover Images — 複数枚アップロード可、設計師参考用" />
      <div style={SBOX}>
        <div>
          <label style={LBL}>今月のタイトル</label>
          <input style={{...FI, fontSize:18}} value={coverTitle} onChange={e=>setCoverTitle(e.target.value)}
            placeholder="例：五月 一葉知秋" />
        </div>
        <div style={{ background:"#fff8f2", border:"1px solid #f0e8d0", borderRadius:8, padding:"12px 16px", fontSize:13, color:"#7a6a5a" }}>
          💡 複数の候補画像をアップロードして、デザイナーに共有できます。
        </div>
        <PhotoGallery images={images} onChange={setImages} showCaption={true} />
      </div>
      <SaveBar onSave={save} saving={saving} />
    </div>
  );
}

// ─── PrefaceSection ───────────────────────────────────────────────────────────
function PrefaceSection({ year, month, notify }) {
  const DEF = { text:"", images:[] };
  const [data, setData] = useState(DEF);
  const [saving, setSaving] = useState(false);
  useEffect(() => { loadS("preface",year,month).then(d => setData(d||DEF)); }, [year,month]);
  const save = async () => { setSaving(true); await saveS("preface",year,month,data); setSaving(false); notify("保存しました ✓"); };
  return (
    <div>
      <SectionHeader title="ごあいさつ" subtitle="Preface — 巻頭言" />
      <div style={SBOX}>
        <div>
          <label style={LBL}>前言本文</label>
          <textarea style={{...FI, resize:"vertical", lineHeight:1.9}} rows={12}
            value={data.text} onChange={e => setData(p=>({...p, text:e.target.value}))}
            placeholder="今月号の前言をこちらに…" />
        </div>
        <PhotoGallery images={data.images} onChange={imgs => setData(p=>({...p, images:imgs}))} showCaption={true} />
      </div>
      <SaveBar onSave={save} saving={saving} />
    </div>
  );
}

// ─── GiftSection ──────────────────────────────────────────────────────────────
function GiftSection({ year, month, notify }) {
  const DEF = { name:"", description:"", images:[] };
  const [data, setData] = useState(DEF);
  const [saving, setSaving] = useState(false);
  useEffect(() => { loadS("gift",year,month).then(d => setData(d||DEF)); }, [year,month]);
  const save = async () => { setSaving(true); await saveS("gift",year,month,data); setSaving(false); notify("保存しました ✓"); };
  const set = k => e => setData(p => ({...p, [k]:e.target.value}));
  return (
    <div>
      <SectionHeader title="小礼物" subtitle="Monthly Gift — 今月のギフト" />
      <div style={SBOX}>
        <div>
          <label style={LBL}>ギフト名</label>
          <input style={FI} value={data.name} onChange={set("name")} placeholder="例：有機農法の茶花糖" />
        </div>
        <div>
          <label style={LBL}>紹介文</label>
          <textarea style={{...FI, resize:"vertical", lineHeight:1.8}} rows={7}
            value={data.description} onChange={set("description")}
            placeholder="このギフトの紹介、選んだ理由、楽しみ方…" />
        </div>
        <PhotoGallery images={data.images} onChange={imgs => setData(p=>({...p, images:imgs}))} showCaption={false} />
      </div>
      <SaveBar onSave={save} saving={saving} />
    </div>
  );
}


// ─── MultiEntrySection (複数追加可能) ────────────────────────────────────────
function MultiEntrySection({ sectionId, year, month, notify, title, subtitle }) {
  const mkEntry = () => ({ id: Date.now().toString(), entryTitle: "", body: "", images: [] });
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadS(sectionId, year, month).then(d => setEntries(d || []));
  }, [sectionId, year, month]);

  const save = async () => {
    setSaving(true);
    await saveS(sectionId, year, month, entries);
    setSaving(false);
    notify("保存しました ✓");
  };

  const addEntry = () => setEntries(p => [...p, mkEntry()]);
  const delEntry = id => setEntries(p => p.filter(e => e.id !== id));
  const setEK = (id, key, val) => setEntries(p => p.map(e => e.id === id ? {...e, [key]: val} : e));
  const setImgs = (id, imgs) => setEntries(p => p.map(e => e.id === id ? {...e, images: imgs} : e));

  return (
    <div>
      <SectionHeader title={title} subtitle={subtitle} />
      <div style={{display:"flex",flexDirection:"column",gap:24}}>
        {entries.map((entry, i) => (
          <div key={entry.id} style={{...SBOX, position:"relative"}}>
            {/* Entry number + delete */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:11,letterSpacing:2,color:"#8a7060",textTransform:"uppercase"}}>
                #{i+1}
              </span>
              <button onClick={() => delEntry(entry.id)}
                style={{fontSize:12,color:"#a05040",textDecoration:"underline",background:"none",border:"none",cursor:"pointer"}}>
                削除
              </button>
            </div>
            <div>
              <label style={LBL}>タイトル</label>
              <input style={FI} value={entry.entryTitle}
                onChange={e => setEK(entry.id, "entryTitle", e.target.value)}
                placeholder="このイベント・活動のタイトル…" />
            </div>
            <div>
              <label style={LBL}>本文</label>
              <textarea style={{...FI, resize:"vertical", lineHeight:1.9}} rows={6}
                value={entry.body}
                onChange={e => setEK(entry.id, "body", e.target.value)}
                placeholder="内容をこちらに…" />
            </div>
            <PhotoGallery
              images={entry.images || []}
              onChange={imgs => setImgs(entry.id, imgs)}
              showCaption={true} />
          </div>
        ))}

        {/* Add button */}
        <button onClick={addEntry} style={{
          border:"1.5px dashed #c9b070",borderRadius:10,padding:"20px",
          background:"none",cursor:"pointer",color:"#8a7060",fontSize:13,
          letterSpacing:2,textTransform:"uppercase",transition:"background .2s",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
        }}
          onMouseOver={e=>e.currentTarget.style.background="#f5eedc"}
          onMouseOut={e=>e.currentTarget.style.background="none"}>
          <span style={{fontSize:20,color:"#c9b070"}}>＋</span>
          新しいエントリーを追加
        </button>
      </div>
      <SaveBar onSave={save} saving={saving} />
    </div>
  );
}


// ─── GuestColumn ──────────────────────────────────────────────────────────────
function GuestColumn({ year, month, notify }) {
  const DEF = { author:"", colTitle:"", body:"", images:[], profileImg:"", profileBio:"" };
  const [data, setData] = useState(DEF);
  const [saving, setSaving] = useState(false);
  const profileRef = useRef();

  useEffect(() => { loadS("guest",year,month).then(d => setData(d||DEF)); }, [year,month]);
  const save = async () => { setSaving(true); await saveS("guest",year,month,data); setSaving(false); notify("保存しました ✓"); };
  const setK = (k,v) => setData(p => ({...p,[k]:v}));

  const handleProfileImg = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    processImage(file).then(src => setK("profileImg", src));
  };

  return (
    <div>
      <SectionHeader title="ゲストコラム" subtitle="Guest Column" />
      <div style={SBOX}>
        <div>
          <label style={LBL}>著者名</label>
          <input style={FI} value={data.author} onChange={e=>setK("author",e.target.value)} placeholder="例：山田花子" />
        </div>
        <div>
          <label style={LBL}>タイトル</label>
          <input style={FI} value={data.colTitle} onChange={e=>setK("colTitle",e.target.value)} placeholder="今月のタイトル…" />
        </div>
        <div>
          <label style={LBL}>本文</label>
          <textarea style={{...FI,resize:"vertical",lineHeight:1.9}} rows={10}
            value={data.body} onChange={e=>setK("body",e.target.value)} placeholder="本文をこちらに…" />
        </div>
        <PhotoGallery images={data.images||[]} onChange={imgs=>setK("images",imgs)} showCaption={true} />

        {/* Profile section */}
        <div style={{borderTop:"1px solid #ede8de",paddingTop:16}}>
          <div style={{fontSize:13,letterSpacing:2,color:"#5a4a3a",fontWeight:600,marginBottom:14}}>
            ゲストプロフィール
          </div>
          <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
            {/* Profile photo */}
            <div style={{flexShrink:0}}>
              {data.profileImg ? (
                <div style={{position:"relative",width:100,height:100}}>
                  <img src={data.profileImg} alt="" style={{width:100,height:100,borderRadius:"50%",objectFit:"cover",display:"block",border:"2px solid #e8e0d0"}}/>
                  <button onClick={()=>setK("profileImg","")} style={{position:"absolute",top:-4,right:-4,
                    background:"#a05040",color:"#fff",border:"none",borderRadius:"50%",
                    width:20,height:20,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
              ) : (
                <div onClick={()=>profileRef.current?.click()} style={{
                  width:100,height:100,borderRadius:"50%",border:"1.5px dashed #c9b070",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  cursor:"pointer",gap:4,background:"#faf6ee"}}>
                  <span style={{fontSize:22,color:"#c9b070"}}>＋</span>
                  <span style={{fontSize:9,color:"#8a7060",letterSpacing:1}}>写真</span>
                </div>
              )}
              <input ref={profileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleProfileImg}/>
            </div>
            {/* Profile bio */}
            <div style={{flex:1}}>
              <label style={LBL}>プロフィール</label>
              <textarea style={{...FI,resize:"vertical",lineHeight:1.8}} rows={5}
                value={data.profileBio} onChange={e=>setK("profileBio",e.target.value)}
                placeholder="ゲストの経歴、活動、紹介文など…" />
            </div>
          </div>
        </div>
      </div>
      <SaveBar onSave={save} saving={saving} />
    </div>
  );
}

// ─── GenericColumn (for hiroko, pilgrimage, report, events, guest) ────────────
function GenericColumn({ sectionId, year, month, notify, title, subtitle, extraFields=[], showCaption=true }) {
  const buildDef = () => { const d = {colTitle:"", body:"", images:[]}; extraFields.forEach(f=>d[f.key]=""); return d; };
  const [data, setData] = useState(buildDef());
  const [saving, setSaving] = useState(false);
  useEffect(() => { loadS(sectionId,year,month).then(d => setData(d||buildDef())); }, [sectionId,year,month]);
  const save = async () => { setSaving(true); await saveS(sectionId,year,month,data); setSaving(false); notify("保存しました ✓"); };
  const setK = (k, v) => setData(p => ({...p, [k]:v}));
  return (
    <div>
      <SectionHeader title={title} subtitle={subtitle} />
      <div style={SBOX}>
        {extraFields.map(f => (
          <div key={f.key}>
            <label style={LBL}>{f.label}</label>
            <input style={FI} value={data[f.key]||""} onChange={e=>setK(f.key,e.target.value)} placeholder={f.ph||""} />
          </div>
        ))}
        <div>
          <label style={LBL}>タイトル</label>
          <input style={FI} value={data.colTitle} onChange={e=>setK("colTitle",e.target.value)} placeholder="今月のタイトル…" />
        </div>
        <div>
          <label style={LBL}>本文</label>
          <textarea style={{...FI, resize:"vertical", lineHeight:1.9}} rows={10}
            value={data.body} onChange={e=>setK("body",e.target.value)} placeholder="本文をこちらに…" />
        </div>
        <PhotoGallery images={data.images||[]} onChange={imgs=>setK("images",imgs)} showCaption={showCaption} />
      </div>
      <SaveBar onSave={save} saving={saving} />
    </div>
  );
}


// ─── TeaPicker ───────────────────────────────────────────────────────────────
function TeaPicker({ library, alreadyIds, onConfirm, onClose, isMobile }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(new Set());
  const filtered = library.filter(t =>
    !q || t.名前?.includes(q) || t.No?.includes(q) || t.分類?.includes(q) || t.場所?.includes(q)
  );
  const toggle = id => setSel(p => { const n = new Set(p); n.has(id)?n.delete(id):n.add(id); return n; });
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#1c151088",zIndex:10001,
      display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",padding:isMobile?"0":"20px"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#faf6ee",borderRadius:isMobile?"16px 16px 0 0":12,
        width:"100%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column",
        boxShadow:"0 20px 60px #1c151044",overflow:"hidden"}}>
        <div style={{background:"#1c1510",padding:"16px 20px",display:"flex",gap:12,alignItems:"center"}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="茶名・No・分類で検索…"
            style={{flex:1,padding:"8px 12px",borderRadius:6,border:"none",fontSize:14,outline:"none"}}
            autoFocus/>
          <button onClick={onClose} style={{color:"#7a6a5a",fontSize:20,background:"none",border:"none",cursor:"pointer"}}>×</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"12px"}}>
          {filtered.length===0&&<div style={{textAlign:"center",color:"#8a7060",padding:"32px 0",fontSize:13}}>該当なし</div>}
          {filtered.map(t => {
            const inf = tInfo(t.分類);
            const checked = sel.has(t.id);
            const already = alreadyIds.includes(t.id);
            return (
              <div key={t.id} onClick={()=>!already&&toggle(t.id)} style={{
                display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:8,
                marginBottom:6,cursor:already?"default":"pointer",
                background:checked?"#f0e8d8":already?"#f5f5f5":"#fff",
                border:`1px solid ${checked?"#c9b070":already?"#e0e0e0":"#ede8de"}`,
                opacity:already?0.5:1,
              }}>
                <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${checked?"#c9b070":"#d0c8bc"}`,
                  background:checked?"#c9b070":"transparent",flexShrink:0,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {checked&&<span style={{color:"#fff",fontSize:12,lineHeight:1}}>✓</span>}
                </div>
                <div style={{width:6,height:6,borderRadius:"50%",background:inf.color,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:"#1c1510",fontWeight:500,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {t.No&&<span style={{color:"#b89a5c",marginRight:6,fontSize:11}}>No.{t.No}</span>}
                    {t.名前||"（名前未入力）"}
                  </div>
                  <div style={{fontSize:11,color:"#8a7060"}}>{t.分類}{t.場所&&` · ${t.場所}`}</div>
                </div>
                {already&&<span style={{fontSize:10,color:"#8a7060",letterSpacing:1}}>追加済</span>}
              </div>
            );
          })}
        </div>
        <div style={{padding:"12px 16px",borderTop:"1px solid #ede8de",background:"#fff8f2",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:12,color:"#8a7060"}}>{sel.size}件選択中</span>
          <button disabled={sel.size===0} onClick={()=>onConfirm([...sel])}
            style={{background:"#1c1510",color:"#f5f0e8",border:"none",borderRadius:6,
              padding:"9px 22px",fontSize:13,letterSpacing:2,cursor:sel.size===0?"default":"pointer",
              opacity:sel.size===0?0.4:1}}>
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}

// Recursively find & replace base64 images in any JSON value
const migrateImagesInValue = async (obj, counter) => {
  if (typeof obj === "string") {
    if (obj.startsWith("data:image")) {
      try {
        const url = await uploadToStorage(obj);
        counter.count++;
        return url;
      } catch { return obj; }
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    const out = [];
    for (const item of obj) out.push(await migrateImagesInValue(item, counter));
    return out;
  }
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = await migrateImagesInValue(v, counter);
    return out;
  }
  return obj;
};

// ─── MigrationPanel ───────────────────────────────────────────────────────────
function MigrationPanel({ notify }) {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [imgRunning, setImgRunning] = useState(false);

  const runImageMigration = async () => {
    if (!window.confirm("全データのBase64画像をStorageに移行します。データ量により数分かかります。実行しますか？")) return;
    setImgRunning(true);
    setLog(["🖼 画像移行を開始…"]);
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/magazine_data?select=id,value`, { headers: SUPA_H });
      const rows = await res.json();
      setLog(p=>[...p, `✓ ${rows.length}件のデータを取得`]);
      let totalImages = 0;
      for (const row of rows) {
        if (row.id.startsWith("backup-")) { continue; } // skip backups
        if (!row.value.includes("data:image")) { continue; } // no base64 images
        setLog(p=>[...p, `🔄 ${row.id} を処理中…`]);
        const data = JSON.parse(row.value);
        const counter = { count: 0 };
        const migrated = await migrateImagesInValue(data, counter);
        if (counter.count > 0) {
          await fetch(`${SUPA_URL}/rest/v1/magazine_data`, {
            method: "POST", headers: { ...SUPA_H, "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify({ id: row.id, value: JSON.stringify(migrated), updated_at: new Date().toISOString() }),
          });
          totalImages += counter.count;
          setLog(p=>[...p, `  ✓ ${counter.count}枚の画像をStorageへ移行`]);
        }
      }
      _libCache = null; // clear cache to force reload
      setLog(p=>[...p, `🎉 完了！合計${totalImages}枚の画像を移行しました。ページを再読み込みしてください。`]);
      notify("画像移行完了 ✓");
    } catch(e) {
      setLog(p=>[...p, `❌ エラー: ${e.message}`]);
    }
    setImgRunning(false);
  };

  const run = async () => {
    setRunning(true); setLog(["📦 月号データを読み込み中…"]);
    try {
      // Load all monthly tea keys
      const res = await fetch(
        `${SUPA_URL}/rest/v1/magazine_data?id=like.chayozine-teas:*&select=id,value`,
        { headers: SUPA_H }
      );
      const rows = await res.json();
      setLog(p=>[...p, `✓ ${rows.length}件の月号データを取得`]);

      // Extract & deduplicate teas by No
      const teaMap = {}; // dedupeKey → tea
      const monthMap = {}; // monthId → [tea]

      for (const row of rows) {
        const data = JSON.parse(row.value);
        if (!Array.isArray(data)) { setLog(p=>[...p, `⏭ ${row.id} は既に移行済みでスキップ`]); continue; }
        monthMap[row.id] = data;
        for (const t of data) {
          const nt = normalizeTea(t);
          const key = nt.No ? `No:${nt.No}` : `id:${nt.id}`;
          if (!teaMap[key]) teaMap[key] = nt;
        }
      }

      const libraryTeas = Object.values(teaMap);
      setLog(p=>[...p, `📚 ${libraryTeas.length}件（重複排除後）を資料庫に保存…`]);

      // Save backups (parallel)
      setLog(p=>[...p, "💾 バックアップ保存中…"]);
      await Promise.all(rows
        .filter(row => Array.isArray(JSON.parse(row.value)))
        .map(row => fetch(`${SUPA_URL}/rest/v1/magazine_data`, {
          method:"POST", headers:{...SUPA_H,"Prefer":"resolution=merge-duplicates"},
          body: JSON.stringify({ id:`backup-${row.id}`, value:row.value, updated_at:new Date().toISOString() })
        })));
      setLog(p=>[...p, "✓ バックアップ保存完了"]);

      // Save library
      setLog(p=>[...p, "📚 資料庫へ保存中…（画像が多いと時間がかかります）"]);
      await saveLibrary(libraryTeas);
      setLog(p=>[...p, `✓ 茶葉資料庫に${libraryTeas.length}件保存`]);

      // Update monthly data to ref format (parallel)
      setLog(p=>[...p, "🔗 月号を参照形式に変換中…"]);
      await Promise.all(Object.entries(monthMap).map(([monthId, teas]) => {
        const refs = teas.map(t => {
          const nt = normalizeTea(t);
          const key = nt.No ? `No:${nt.No}` : `id:${nt.id}`;
          return { teaId: teaMap[key].id, note: "" };
        });
        return fetch(`${SUPA_URL}/rest/v1/magazine_data`, {
          method:"POST", headers:{...SUPA_H,"Prefer":"resolution=merge-duplicates"},
          body: JSON.stringify({ id:monthId, value:JSON.stringify({mode:"refs",refs}), updated_at:new Date().toISOString() })
        });
      }));
      setLog(p=>[...p, `✓ ${Object.keys(monthMap).length}件の月号を変換完了`]);

      setLog(p=>[...p, "🎉 移行完了！バックアップは backup-chayozine-teas:* に保存済"]);
      setDone(true);
    } catch(e) {
      setLog(p=>[...p, `❌ エラー: ${e.message}`]);
    }
    setRunning(false);
  };

  const restore = async (monthKey) => {
    const backupKey = `backup-${monthKey}`;
    const res = await fetch(`${SUPA_URL}/rest/v1/magazine_data?id=eq.${backupKey}&select=value`, { headers: SUPA_H });
    const rows = await res.json();
    if (!rows[0]) { alert("バックアップが見つかりません"); return; }
    await fetch(`${SUPA_URL}/rest/v1/magazine_data`, {
      method:"POST", headers:{...SUPA_H,"Prefer":"resolution=merge-duplicates"},
      body: JSON.stringify({ id:monthKey, value:rows[0].value, updated_at:new Date().toISOString() })
    });
    notify(`${monthKey} を復元しました`);
  };

  return (
    <div style={SBOX}>
      <div style={{fontSize:14,color:"#5a4a3a",fontWeight:600,letterSpacing:1}}>データ移行ツール</div>
      <div style={{fontSize:13,color:"#7a6a5a",lineHeight:1.8}}>
        既存の月号データを茶葉資料庫に統合します。<br/>
        移行前に自動バックアップを作成するので、元に戻すことができます。
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        {!done && (
          <button disabled={running} onClick={run} style={{
            background:running?"#3a2e26":"#1c1510",color:"#f5f0e8",border:"none",
            borderRadius:7,padding:"11px 24px",fontSize:13,letterSpacing:2,cursor:"pointer"}}>
            {running?"移行中…":"① 資料庫へ一括移行"}
          </button>
        )}
        <button disabled={imgRunning} onClick={runImageMigration} style={{
          background:imgRunning?"#3a2e26":"#3a6e7a",color:"#f5f0e8",border:"none",
          borderRadius:7,padding:"11px 24px",fontSize:13,letterSpacing:2,cursor:"pointer"}}>
          {imgRunning?"画像移行中…":"② 画像をStorageへ移行（高速化）"}
        </button>
      </div>
      {log.length>0&&(
        <div style={{background:"#1c1510",borderRadius:8,padding:"14px 16px",fontFamily:"monospace",fontSize:12,color:"#c9b070"}}>
          {log.map((l,i)=><div key={i}>{l}</div>)}
        </div>
      )}
      {done&&(
        <div>
          <div style={{fontSize:12,color:"#8a7060",marginBottom:8}}>復元が必要な場合（月号キーを入力）：</div>
          <div style={{display:"flex",gap:8}}>
            <input id="restoreKey" placeholder="例：chayozine-teas:2026-06" style={{...FI,flex:1,fontSize:12}}/>
            <button onClick={()=>{const v=document.getElementById("restoreKey").value; if(v)restore(v);}}
              style={{background:"#8a3a2e",color:"#f5f0e8",border:"none",borderRadius:6,
                padding:"9px 16px",fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>
              復元する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TeaLibrarySection ────────────────────────────────────────────────────────
function TeaLibrarySection({ notify, isMobile, onModalChange }) {
  const [teas, setTeas]   = useState([]);
  const [loading, setLoad] = useState(true);
  const [modal, setModal]  = useState(null);
  const [form,  setForm]   = useState(null);
  const [tab,   setTab]    = useState(0);
  const [saving, setSave]  = useState(false);
  const [showMigrate, setShowMigrate] = useState(false);

  const sortByNo = (arr) => [...arr].sort((a, b) => {
    const na = parseFloat(a.No), nb = parseFloat(b.No);
    if (isNaN(na) && isNaN(nb)) return 0;
    if (isNaN(na)) return 1;  // No無しは後ろ
    if (isNaN(nb)) return -1;
    return na - nb;
  });
  const loadTeas = useCallback(async () => {
    setLoad(true);
    const d = await loadLibrary();
    setTeas(sortByNo((d.map ? d : []).map(normalizeTea)));
    setLoad(false);
  }, []);
  useEffect(() => { loadTeas(); }, [loadTeas]);

  const persist = async (u) => { await saveLibrary(u); setTeas(sortByNo(u)); };
  const openAdd  = () => { setForm(mkTea()); setTab(0); setModal("add");  onModalChange?.(true); };
  const openEdit = t  => { setForm(normalizeTea(JSON.parse(JSON.stringify(t)))); setTab(0); setModal("edit"); onModalChange?.(true); };
  const closeMod = () => { setModal(null); setForm(null); onModalChange?.(false); };
  const setF = (path, val) => setForm(prev => {
    const next = JSON.parse(JSON.stringify(prev));
    const keys = path.split(".");
    let obj = next;
    for (let i = 0; i < keys.length-1; i++) obj = obj[keys[i]];
    obj[keys[keys.length-1]] = val;
    return next;
  });
  const addRec = () => {
    const ts = new Date().toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    setForm(p => ({...p, 試飲記録:[...(p.試飲記録||[]),{id:Date.now().toString(),時間:ts,感想:""}]}));
  };
  const setRec = (i,k,v) => setForm(p => { const a=JSON.parse(JSON.stringify(p.試飲記録)); a[i][k]=v; return {...p,試飲記録:a}; });
  const delRec = i => setForm(p => ({...p,試飲記録:p.試飲記録.filter((_,j)=>j!==i)}));
  const handleSave = async () => {
    if (!form?.名前?.trim()) return;
    setSave(true);
    const u = modal==="add" ? [...teas,form] : teas.map(t=>t.id===form.id?form:t);
    await persist(u); setSave(false); closeMod();
    notify(modal==="add"?"資料庫に追加しました ✓":"保存しました ✓");
  };
  const handleDelete = async () => {
    await persist(teas.filter(t=>t.id!==form.id)); closeMod(); notify("削除しました");
  };
  const done = t => [!!t.名前,!!(t.丁寧編?.茶器||t.丁寧編?.手順),!!(t.クイック編?.HOT||t.クイック編?.COLD),!!(t.試飲記録?.length),!!(t.ストーリー?.内容||t.ストーリー?.画像?.length),!!(t.基本画像?.length)];

  return (
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <SectionHeader title="茶葉資料庫" subtitle={`Tea Library — 全${teas.length}件`} />
        <button onClick={()=>setShowMigrate(p=>!p)} style={{fontSize:11,color:"#8a7060",
          letterSpacing:1,background:"#f0e8d8",border:"1px solid #d4c8b4",borderRadius:5,
          padding:"5px 12px",cursor:"pointer",marginTop:4,whiteSpace:"nowrap"}}>
          {showMigrate?"▲ 移行ツールを閉じる":"⚙ データ移行ツール"}
        </button>
      </div>
      {showMigrate&&<div style={{marginBottom:24}}><MigrationPanel notify={notify}/></div>}
      {loading ? (
        <div style={{textAlign:"center",color:"#8a7060",padding:"40px 0"}}>読み込み中…</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:24}}>
          {/* Add button at top */}
          <button onClick={openAdd} style={{
            border:"1.5px dashed #c9b070",borderRadius:10,padding:"14px",background:"none",
            cursor:"pointer",color:"#8a7060",fontSize:13,letterSpacing:2,
            display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"background .2s"}}
            onMouseOver={e=>e.currentTarget.style.background="#f5eedc"}
            onMouseOut={e=>e.currentTarget.style.background="none"}>
            <span style={{fontSize:18,color:"#b89a5c"}}>＋</span> 茶葉を追加
          </button>

          {/* Grouped by category */}
          {TEA_TYPES.map(type => {
            const group = teas.filter(t => t.分類 === type.label);
            if (group.length === 0) return null;
            return (
              <div key={type.label}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:type.color}}/>
                  <span style={{fontSize:14,letterSpacing:2,color:"#5a4a3a",fontWeight:600}}>{type.label}</span>
                  <span style={{fontSize:11,color:"#8a7060"}}>{group.length}件</span>
                  <div style={{flex:1,height:1,background:"#ede8de"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
                  {group.map(tea => {
                    const d = done(tea);
                    return (
                      <div key={tea.id} onClick={()=>openEdit(tea)}
                        style={{background:"#fff",border:"1px solid #e8e0d0",borderRadius:8,
                          padding:"10px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,
                          transition:"border-color .15s,box-shadow .15s"}}
                        onMouseOver={e=>{e.currentTarget.style.borderColor=type.color;e.currentTarget.style.boxShadow="0 2px 10px #1c15100f"}}
                        onMouseOut={e=>{e.currentTarget.style.borderColor="#e8e0d0";e.currentTarget.style.boxShadow="none"}}>
                        {tea.基本画像?.[0]?.src
                          ? <img src={tea.基本画像[0].src} alt="" style={{width:36,height:36,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
                          : <div style={{width:36,height:36,borderRadius:6,background:type.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🍵</div>}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:"#1c1510",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {tea.No&&<span style={{color:"#b89a5c",fontSize:11,marginRight:5}}>No.{tea.No}</span>}
                            {tea.名前||"（名前未入力）"}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                            {tea.場所&&<span style={{fontSize:10,color:"#8a7060",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tea.場所}</span>}
                            <div style={{display:"flex",gap:3,marginLeft:"auto",flexShrink:0}}>
                              {TEA_TABS.map((_,di)=><div key={di} style={{width:5,height:5,borderRadius:"50%",background:d[di]?type.color:"#e0d8cc",opacity:d[di]?.85:.35}}/>)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* No-category teas (shouldn't happen but safety) */}
          {(() => {
            const known = TEA_TYPES.map(t=>t.label);
            const others = teas.filter(t => !known.includes(t.分類));
            if (others.length === 0) return null;
            return (
              <div>
                <div style={{fontSize:13,color:"#8a7060",marginBottom:8}}>未分類（{others.length}件）</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
                  {others.map(tea=>(
                    <div key={tea.id} onClick={()=>openEdit(tea)} style={{background:"#fff",border:"1px solid #e8e0d0",borderRadius:8,padding:"10px 12px",cursor:"pointer",fontSize:13}}>
                      {tea.No&&<span style={{color:"#b89a5c",fontSize:11,marginRight:5}}>No.{tea.No}</span>}{tea.名前}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {modal&&form&&(
        <div onClick={closeMod} style={{position:"fixed",inset:0,background:"#1c151088",zIndex:10000,display:"flex",alignItems:isMobile?"flex-end":"flex-start",justifyContent:"center",padding:isMobile?"0":"28px 16px 60px",overflowY:isMobile?"hidden":"auto",WebkitOverflowScrolling:"touch"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#faf6ee",borderRadius:isMobile?"16px 16px 0 0":16,width:"100%",maxWidth:isMobile?"100%":640,height:isMobile?"88vh":"85vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px #1c151044",overflow:"hidden"}}>
            <div style={{background:"#1c1510",padding:"18px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,color:"#f5f0e8",fontStyle:"italic",fontWeight:300}}>{modal==="add"?"新しいお茶を追加":form.名前||"お茶を編集"}</div>
                <div style={{fontSize:11,color:"#c9b070",letterSpacing:2,marginTop:2}}>茶葉資料庫</div>
              </div>
              <button onClick={closeMod} style={{color:"#7a6a5a",fontSize:22,border:"none",background:"none",cursor:"pointer"}}>×</button>
            </div>
            <div style={{background:"#1c1510",padding:"0 20px 14px",display:"flex",gap:4,overflowX:"auto",borderBottom:"1px solid #c9b07022"}}>
              {TEA_TABS.map((t,i)=>{const d=done(form)[i];return<button key={i} onClick={()=>setTab(i)} style={{padding:"7px 14px",fontSize:12,letterSpacing:1,borderRadius:20,cursor:"pointer",whiteSpace:"nowrap",border:"none",background:tab===i?"#1c1510":d?"#2a2018":"transparent",color:tab===i?"#f5f0e8":d?"#c9b070":"#8a7060"}}>{d&&tab!==i&&<span style={{color:"#c9b070",marginRight:4,fontSize:10}}>✓</span>}{t}</button>;})}
            </div>
            <LibraryTeaTabBody tab={tab} form={form} setF={setF} isMobile={isMobile} addRec={addRec} setRec={setRec} delRec={delRec}/>
            <div style={{padding:"14px 24px",borderTop:"1px solid #ede8de",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff8f2",flexShrink:0,zIndex:2}}>
              {modal==="edit"?<button onClick={handleDelete} style={{color:"#a05040",fontSize:12,letterSpacing:1,textDecoration:"underline",border:"none",background:"none",cursor:"pointer"}}>このお茶を削除</button>:<span/>}
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{display:"flex",gap:6}}>{TEA_TABS.map((_,i)=><button key={i} onClick={()=>setTab(i)} style={{width:8,height:8,borderRadius:"50%",border:"none",cursor:"pointer",padding:0,background:tab===i?"#1c1510":"#d0c8bc"}}/>)}</div>
                <button disabled={!form?.名前?.trim()||saving} onClick={handleSave} style={{background:"#1c1510",color:"#f5f0e8",borderRadius:7,padding:"11px 28px",fontSize:13,letterSpacing:2,fontWeight:600,border:"none",cursor:"pointer",opacity:!form?.名前?.trim()||saving?0.4:1}}>
                  {saving?"保存中…":"全部保存する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Shared tab body for library and monthly tea modals
function LibraryTeaTabBody({ tab, form, setF, isMobile, addRec, setRec, delRec }) {
  return (
    <div style={{padding:isMobile?"14px 14px 80px 14px":"24px",display:"flex",flexDirection:"column",gap:16,flex:"1 1 0",minHeight:0,overflowY:"scroll",WebkitOverflowScrolling:"touch"}}>
      {tab===0&&<>
        <div style={{display:"flex",alignItems:"flex-end",gap:10,marginBottom:4}}>
          <div style={{width:100}}>
            <label style={LBL}>NO.</label>
            <input style={{...FI,fontSize:20,fontWeight:600,textAlign:"center",letterSpacing:2}} placeholder="01" value={form?.No||""} onChange={e=>setF("No",e.target.value)}/>
          </div>
          <div style={{flex:1}}>
            <label style={LBL}>お茶名 <span style={{color:"#c05040"}}>*</span></label>
            <input style={{...FI,fontSize:16}} placeholder="例：大紅袍…" value={form?.名前||""} onChange={e=>setF("名前",e.target.value)}/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><label style={LBL}>お茶分類</label>
            <select style={{...FI,appearance:"none",cursor:"pointer"}} value={form?.分類||"緑茶"} onChange={e=>setF("分類",e.target.value)}>
              {TEA_TYPES.map(t=><option key={t.label}>{t.label}</option>)}</select></div>
          <div><label style={LBL}>場所 · 産地</label>
            <input style={FI} placeholder="例：福建省武夷山" value={form?.場所||""} onChange={e=>setF("場所",e.target.value)}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><label style={LBL}>ひながら</label>
            <input style={FI} placeholder="例：一芽二葉" value={form?.ひながら||""} onChange={e=>setF("ひながら",e.target.value)}/></div>
          <div><label style={LBL}>収穫日</label>
            <input style={FI} placeholder="例：2025年4月清明前" value={form?.収穫日||""} onChange={e=>setF("収穫日",e.target.value)}/></div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
            <label style={LBL}>説明</label>
            <span style={{fontSize:11,color:(form?.説明||"").length>400?"#c05040":"#8a7060"}}>{(form?.説明||"").length}/400</span>
          </div>
          <textarea style={{...FI,resize:"vertical",lineHeight:1.8,borderColor:(form?.説明||"").length>400?"#c05040":"#e0d8cc"}} rows={4} maxLength={400} value={form?.説明||""} onChange={e=>setF("説明",e.target.value)} placeholder="風味・香り…"/>
        </div>
        <div><label style={LBL}>おやつのおすすめ</label>
          <input style={FI} placeholder="例：和三盆…" value={form?.おやつ||""} onChange={e=>setF("おやつ",e.target.value)}/></div>
      </>}
      {tab===1&&<>
        <div style={{fontSize:15,letterSpacing:2,color:"#5a4a3a",fontWeight:600}}>淹れ方１ ーじっくり丁寧編ー</div>
        <div style={SBOX}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div><label style={LBL}>茶器</label><input style={FI} placeholder="例：蓋碗" value={form?.丁寧編?.茶器||""} onChange={e=>setF("丁寧編.茶器",e.target.value)}/></div>
            <div><label style={LBL}>投茶量</label><input style={FI} placeholder="例：5g" value={form?.丁寧編?.投茶量||""} onChange={e=>setF("丁寧編.投茶量",e.target.value)}/></div>
          </div>
          <div><label style={LBL}>水温</label><input style={FI} placeholder="例：95℃" value={form?.丁寧編?.水温||""} onChange={e=>setF("丁寧編.水温",e.target.value)}/></div>
          <div><label style={LBL}>手順</label><textarea style={{...FI,resize:"vertical",lineHeight:1.8}} rows={7} value={form?.丁寧編?.手順||""} onChange={e=>setF("丁寧編.手順",e.target.value)} placeholder={"1. 茶器を温湯で温める…"}/></div>
        </div>
      </>}
      {tab===2&&<>
        <div style={{fontSize:15,letterSpacing:2,color:"#5a4a3a",fontWeight:600}}>淹れ方２ ークイック編ー</div>
        <div style={SBOX}>
          <div>
            <span style={{background:"#f5e8e4",border:"1px solid #d4a89a",borderRadius:4,padding:"3px 14px",fontSize:12,color:"#8a3a2e",letterSpacing:2,fontWeight:600}}>HOT 🍵</span>
            <textarea style={{...FI,resize:"vertical",lineHeight:1.8,marginTop:10}} rows={4} value={form?.クイック編?.HOT||""} onChange={e=>setF("クイック編.HOT",e.target.value)} placeholder="例：マグカップに茶葉3g…"/>
          </div>
          <div style={{height:1,background:"#ede8de"}}/>
          <div>
            <span style={{background:"#e4f0f2",border:"1px solid #a0ccd4",borderRadius:4,padding:"3px 14px",fontSize:12,color:"#3a6e7a",letterSpacing:2,fontWeight:600}}>COLD 🧊</span>
            <textarea style={{...FI,resize:"vertical",lineHeight:1.8,marginTop:10}} rows={4} value={form?.クイック編?.COLD||""} onChange={e=>setF("クイック編.COLD",e.target.value)} placeholder="例：水出し：茶葉5g…"/>
          </div>
        </div>
      </>}
      {tab===3&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:15,letterSpacing:2,color:"#5a4a3a",fontWeight:600}}>試飲記録</div>
          <button onClick={addRec} style={{background:"#1c1510",color:"#f5f0e8",borderRadius:6,padding:"7px 16px",fontSize:11,letterSpacing:2,border:"none",cursor:"pointer"}}>＋ 記録を追加</button>
        </div>
        {(!form?.試飲記録||form.試飲記録.length===0)&&<div style={{textAlign:"center",padding:"24px 0",color:"#8a7060",fontSize:13}}>まだ試飲記録がありません</div>}
        {(form?.試飲記録||[]).map((rec,i)=>(
          <div key={rec.id} style={{background:"#faf6ee",border:"1px solid #e8e0d0",borderRadius:8,padding:"14px 16px",position:"relative"}}>
            <button onClick={()=>delRec(i)} style={{position:"absolute",top:10,right:12,color:"#c0a090",fontSize:16,border:"none",background:"none",cursor:"pointer"}}>×</button>
            <div style={{marginBottom:10}}><label style={LBL}>時間</label>
              <input style={{...FI,maxWidth:240}} value={rec.時間||""} onChange={e=>setRec(i,"時間",e.target.value)}/></div>
            <div><label style={LBL}>感想</label>
              <textarea style={{...FI,resize:"vertical",lineHeight:1.8}} rows={3} value={rec.感想||""} onChange={e=>setRec(i,"感想",e.target.value)}/></div>
          </div>
        ))}
      </>}
      {tab===4&&<>
        <div style={{fontSize:15,letterSpacing:2,color:"#5a4a3a",fontWeight:600}}>バックグラウンドストーリー</div>
        <div style={SBOX}>
          <PhotoGallery images={Array.isArray(form?.ストーリー?.画像)?form.ストーリー.画像:[]} onChange={imgs=>setF("ストーリー.画像",imgs)} showCaption={true}/>
          <div><label style={LBL}>ストーリー・背景</label>
            <textarea style={{...FI,resize:"vertical",lineHeight:1.9}} rows={8} value={form?.ストーリー?.内容||""} onChange={e=>setF("ストーリー.内容",e.target.value)} placeholder="産地、生産者、歴史、出会いの物語…"/></div>
        </div>
      </>}
      {tab===5&&<>
        <div style={{fontSize:15,letterSpacing:2,color:"#5a4a3a",fontWeight:600,marginBottom:8}}>基本画像</div>
        <div style={{fontSize:12,color:"#8a7060",letterSpacing:1,marginBottom:12,lineHeight:1.7}}>茶葉ファインダーのヒーロー画像として使用。最初の1枚がメイン画像になります。</div>
        <div style={SBOX}>
          <PhotoGallery images={Array.isArray(form?.基本画像)?form.基本画像:[]} onChange={imgs=>setF("基本画像",imgs)} showCaption={true}/>
        </div>
      </>}
    </div>
  );
}

// ─── TeaSection (full tea catalog with modal) ─────────────────────────────────
function TeaSection({ year, month, notify, isMobile, onModalChange }) {
  const [teas,  setTeas]   = useState([]);
  const [loading, setLoad] = useState(true);
  const [modal, setModal]  = useState(null);
  const [form,  setForm]   = useState(null);
  const [tab,   setTab]    = useState(0);
  const [saving, setSave]  = useState(false);
  const [library, setLibrary] = useState([]);
  const [refs, setRefs] = useState([]); // [{teaId, note}]
  const [refMode, setRefMode] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const loadTeas = useCallback(async () => {
    setLoad(true);
    const [rawData, lib] = await Promise.all([
      loadS("teas", year, month),
      loadLibrary(),
    ]);
    setLibrary(lib);
    if (isRefMode(rawData)) {
      // New ref format
      setRefMode(true);
      const r = rawData.refs || [];
      setRefs(r);
      setTeas(r.map(ref => lib.find(t => t.id === ref.teaId)).filter(Boolean).map(normalizeTea));
    } else {
      setRefMode(false);
      setTeas((rawData || []).map(normalizeTea));
    }
    setLoad(false);
  }, [year, month]);

  useEffect(() => { loadTeas(); }, [loadTeas]);
  const persist = async (u) => { await saveS("teas",year,month,u); setTeas(u); };

  const openAdd  = () => { setForm(mkTea()); setTab(0); setModal("add"); onModalChange?.(true); };
  const openEdit = t  => { setForm(normalizeTea(JSON.parse(JSON.stringify(t)))); setTab(0); setModal("edit"); onModalChange?.(true); };
  const closeMod = () => { setModal(null); setForm(null); onModalChange?.(false); };

  const setF = (path, val) => setForm(prev => {
    const next = JSON.parse(JSON.stringify(prev));
    const keys = path.split(".");
    let obj = next;
    for (let i = 0; i < keys.length-1; i++) obj = obj[keys[i]];
    obj[keys[keys.length-1]] = val;
    return next;
  });

  const addRec = () => {
    const ts = new Date().toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    setForm(p => ({...p, 試飲記録:[...(p.試飲記録||[]),{id:Date.now().toString(),時間:ts,感想:""}]}));
  };
  const setRec = (i,k,v) => setForm(p => { const a=JSON.parse(JSON.stringify(p.試飲記録)); a[i][k]=v; return {...p,試飲記録:a}; });
  const delRec = i => setForm(p => ({...p, 試飲記録:p.試飲記録.filter((_,j)=>j!==i)}));

  const handleSave = async () => {
    if (!form?.名前?.trim()) return;
    setSave(true);
    if (refMode) {
      const newLib = modal==="add" ? [...library, form] : library.map(t => t.id===form.id ? form : t);
      await saveLibrary(newLib);
      setLibrary(newLib);
      let newRefs = refs;
      if (modal==="add") {
        // 新茶は資料庫に保存して、この月にも自動追加
        newRefs = [...refs, { teaId: form.id, note: "" }];
        setRefs(newRefs);
        await saveS("teas", year, month, { mode:"refs", refs:newRefs });
      }
      setTeas(newRefs.map(r => newLib.find(t => t.id === r.teaId)).filter(Boolean).map(normalizeTea));
      setSave(false); closeMod();
      notify(modal==="add" ? "資料庫に登録し、この月に追加しました ✓" : "資料庫に保存しました ✓");
    } else {
      const u = modal==="add" ? [...teas,form] : teas.map(t=>t.id===form.id?form:t);
      await persist(u); setSave(false); closeMod();
      notify(modal==="add" ? "追加しました ✓" : "保存しました ✓");
    }
  };
  const handleDel = async () => {
    if (refMode) {
      await removeRef(form.id); closeMod(); notify("月号から外しました（資料庫には残ります）");
    } else {
      await persist(teas.filter(t=>t.id!==form.id)); closeMod(); notify("削除しました");
    }
  };

  const done = t => [!!t.名前, !!(t.丁寧編?.茶器||t.丁寧編?.手順), !!(t.クイック編?.HOT||t.クイック編?.COLD), !!(t.試飲記録?.length), !!(t.ストーリー?.内容||t.ストーリー?.画像?.length), !!(t.基本画像?.length)];

  const saveRefMode = async (newRefs) => {
    await saveS("teas", year, month, { mode:"refs", refs: newRefs });
    notify("保存しました ✓");
  };
  const removeRef = async (teaId) => {
    const newRefs = refs.filter(r => r.teaId !== teaId);
    setRefs(newRefs);
    setTeas(newRefs.map(r => library.find(t => t.id === r.teaId)).filter(Boolean).map(normalizeTea));
    await saveRefMode(newRefs);
  };
  const addFromPicker = async (ids) => {
    const newEntries = ids.map(id => ({ teaId: id, note: "" }));
    const newRefs = [...refs, ...newEntries];
    setRefs(newRefs);
    setTeas(newRefs.map(r => library.find(t => t.id === r.teaId)).filter(Boolean).map(normalizeTea));
    setShowPicker(false);
    await saveRefMode(newRefs);
    notify("追加しました ✓");
  };
  const moveRef = async (idx, dir) => {
    const newRefs = [...refs];
    const swap = idx + dir;
    if (swap < 0 || swap >= newRefs.length) return;
    [newRefs[idx], newRefs[swap]] = [newRefs[swap], newRefs[idx]];
    setRefs(newRefs);
    setTeas(newRefs.map(r => library.find(t => t.id === r.teaId)).filter(Boolean).map(normalizeTea));
    await saveRefMode(newRefs);
  };
  const updateNote = async (teaId, note) => {
    const newRefs = refs.map(r => r.teaId === teaId ? {...r, note} : r);
    setRefs(newRefs);
  };
  const saveNotes = async () => { await saveRefMode(refs); notify("保存しました ✓"); };

  return (
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <SectionHeader title="月間茶帳" subtitle={refMode ? `資料庫から ${teas.length} 款を選択中` : `${teas.length} 款のお茶`} />
        <div style={{display:"flex",gap:8,alignItems:"center",marginTop:4}}>
          {!refMode && library.length > 0 && (
            <button onClick={async()=>{
              if(window.confirm("資料庫参照モードに切り替えますか？ 現在の月号データは保持されます。")){
                setRefMode(true);
                const newRefs = teas.map(t=>({teaId:t.id,note:""})).filter(r=>library.find(t=>t.id===r.teaId));
                setRefs(newRefs);
                await saveRefMode(newRefs);
              }
            }} style={{fontSize:11,color:"#3a6e7a",letterSpacing:1,background:"#e4f0f2",border:"1px solid #a0ccd4",borderRadius:5,padding:"5px 12px",cursor:"pointer",whiteSpace:"nowrap"}}>
              📚 資料庫モードに切り替え
            </button>
          )}
          {refMode && (
            <>
              <button onClick={()=>setShowPicker(true)} style={{background:"#1c1510",color:"#c9b070",border:"1px solid #c9b07044",borderRadius:6,padding:"8px 16px",fontSize:12,letterSpacing:2,cursor:"pointer",whiteSpace:"nowrap"}}>
                ＋ 資料庫から追加
              </button>
              <button onClick={openAdd} style={{background:"#3a6e7a",color:"#f5f0e8",border:"none",borderRadius:6,padding:"8px 16px",fontSize:12,letterSpacing:2,cursor:"pointer",whiteSpace:"nowrap"}}>
                ✦ 新しいお茶を登録
              </button>
            </>
          )}
        </div>
      </div>
      {showPicker && (
        <TeaPicker library={library} alreadyIds={refs.map(r=>r.teaId)} onConfirm={addFromPicker} onClose={()=>setShowPicker(false)} isMobile={isMobile}/>
      )}
      {loading ? (
        <div style={{textAlign:"center",color:"#8a7060",padding:"40px 0",letterSpacing:2}}>読み込み中…</div>
      ) : refMode ? (
        /* ── Ref mode: card grid (same style as inline mode) ── */
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:20}}>
          {teas.map((tea,i) => {
            const inf = tInfo(tea.分類);
            const d   = done(tea);
            return (
              <div key={tea.id} onClick={()=>openEdit(tea)}
                style={{background:"#fff",border:"1px solid #e8e0d0",borderRadius:14,overflow:"hidden",cursor:"pointer",
                  transition:"transform .18s,box-shadow .18s"}}
                onMouseOver={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 28px #1c151014"}}
                onMouseOut={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}>
                <div style={{height:5,background:inf.color,opacity:.7}}/>
                <div style={{padding:"18px 20px 20px"}}>
                  <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{background:inf.bg,color:inf.color,border:`1px solid ${inf.border}`,
                      borderRadius:4,padding:"3px 10px",fontSize:11,letterSpacing:1.5,fontWeight:600}}>{tea.分類}</span>
                    {tea.場所&&<span style={{fontSize:11,color:"#8a7060"}}>📍 {tea.場所}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
                    {tea.No&&<span style={{fontSize:13,color:"#b89a5c",letterSpacing:2,fontFamily:"'Cormorant Garamond',serif"}}>No.{tea.No}</span>}
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontStyle:"italic",color:"#1c1510",lineHeight:1.2}}>
                      {tea.名前||"（名前未入力）"}
                    </div>
                  </div>
                  {tea.ひながら&&<div style={{fontSize:12,color:"#8a7060",marginBottom:8}}>{tea.ひながら}</div>}
                  <div style={{height:1,background:"#ede8de",margin:"10px 0"}}/>
                  {tea.説明&&<div style={{fontSize:13,color:"#4a3a2a",lineHeight:1.8,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",marginBottom:8}}>{tea.説明}</div>}
                  {tea.基本画像?.[0]?.src&&<div style={{marginBottom:8,borderRadius:6,overflow:"hidden",height:80}}><img src={tea.基本画像[0].src} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginTop:8}}>
                    {tea.収穫日&&<div style={{fontSize:11,color:"#7a6a5a"}}>{tea.収穫日}</div>}
                    <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
                      {TEA_TABS.map((_,di)=><div key={di} style={{width:7,height:7,borderRadius:"50%",background:d[di]?inf.color:"#e0d8cc",opacity:d[di]?.85:.35}}/>)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div onClick={openAdd}
            style={{border:"1.5px dashed #c9b070",borderRadius:14,display:"flex",flexDirection:"column",
              alignItems:"center",justifyContent:"center",gap:10,minHeight:180,cursor:"pointer",transition:"background .2s"}}
            onMouseOver={e=>e.currentTarget.style.background="#f5eedc"}
            onMouseOut={e=>e.currentTarget.style.background="transparent"}>
            <div style={{width:48,height:48,borderRadius:"50%",background:"#f0e8d4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,color:"#b89a5c"}}>＋</div>
            <div style={{fontSize:12,letterSpacing:2,color:"#8a7060",textTransform:"uppercase"}}>茶を追加</div>
          </div>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:20}}>
          {teas.map((tea,i) => {
            const inf = tInfo(tea.分類);
            const d   = done(tea);
            return (
              <div key={tea.id} onClick={() => openEdit(tea)}
                style={{background:"#fff",border:"1px solid #e8e0d0",borderRadius:14,overflow:"hidden",cursor:"pointer",
                  transition:"transform .18s,box-shadow .18s"}}
                onMouseOver={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 28px #1c151014"}}
                onMouseOut={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}>
                <div style={{height:5,background:inf.color,opacity:.7}}/>
                <div style={{padding:"18px 20px 20px"}}>
                  <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{background:inf.bg,color:inf.color,border:`1px solid ${inf.border}`,
                      borderRadius:4,padding:"3px 10px",fontSize:11,letterSpacing:1.5,fontWeight:600}}>{tea.分類}</span>
                    {tea.場所&&<span style={{fontSize:11,color:"#8a7060"}}>📍 {tea.場所}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                    {tea.No&&<span style={{fontSize:13,color:"#b89a5c",letterSpacing:2,fontFamily:"'Cormorant Garamond',serif"}}>No.{tea.No}</span>}
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:26,fontStyle:"italic",color:"#1c1510",lineHeight:1.2}}>
                      {tea.名前||"（名前未入力）"}
                    </div>
                  </div>
                  {tea.ひながら&&<div style={{fontSize:12,color:"#8a7060",marginBottom:8}}>{tea.ひながら}</div>}
                  <div style={{height:1,background:"#ede8de",margin:"10px 0"}}/>
                  {tea.説明&&<div style={{fontSize:13,color:"#4a3a2a",lineHeight:1.8,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",marginBottom:8}}>{tea.説明}</div>}
                  {tea.ストーリー?.画像?.[0]?.src&&<div style={{marginBottom:8,borderRadius:6,overflow:"hidden",height:70}}><img src={tea.ストーリー.画像[0].src} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                    {tea.収穫日&&<div style={{fontSize:11,color:"#7a6a5a"}}>{tea.収穫日}</div>}
                    <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
                      {TEA_TABS.map((_,di)=><div key={di} style={{width:7,height:7,borderRadius:"50%",background:d[di]?inf.color:"#e0d8cc",opacity:d[di]?.85:.35}}/>)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div onClick={openAdd}
            style={{border:"1.5px dashed #c9b070",borderRadius:14,display:"flex",flexDirection:"column",
              alignItems:"center",justifyContent:"center",gap:10,minHeight:180,cursor:"pointer",transition:"background .2s"}}
            onMouseOver={e=>e.currentTarget.style.background="#f5eedc"}
            onMouseOut={e=>e.currentTarget.style.background="transparent"}>
            <div style={{width:48,height:48,borderRadius:"50%",background:"#f0e8d4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,color:"#b89a5c"}}>＋</div>
            <div style={{fontSize:12,letterSpacing:2,color:"#8a7060",textTransform:"uppercase"}}>茶を追加</div>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {modal && form && (
        <div onClick={closeMod} style={{position:"fixed",inset:0,background:"#1c151088",zIndex:10000,
          display:"flex",alignItems:isMobile?"flex-end":"flex-start",justifyContent:"center",
          padding:isMobile?"0":"28px 16px 60px",overflowY:isMobile?"hidden":"auto",
          WebkitOverflowScrolling:"touch"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#faf6ee",
            borderRadius:isMobile?"16px 16px 0 0":16,width:"100%",
            maxWidth:isMobile?"100%":640,
            height:isMobile?"88vh":"85vh",
            display:"flex",flexDirection:"column",
            boxShadow:"0 24px 60px #1c151044",
            overflow:"hidden"}}>
            <div style={{background:"#1c1510",padding:"18px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,color:"#f5f0e8",fontStyle:"italic",fontWeight:300}}>
                  {modal==="add"?"新しいお茶を追加":form.名前||"お茶を編集"}
                </div>
                <div style={{fontSize:11,color:"#c9b070",letterSpacing:2,marginTop:2}}>{year}年 {MONTH_JA[month-1]}</div>
              </div>
              <button onClick={closeMod} style={{color:"#7a6a5a",fontSize:22,border:"none",background:"none",cursor:"pointer",padding:"4px 8px"}}>×</button>
            </div>
            {/* Tabs */}
            <div style={{background:"#1c1510",padding:"0 20px 14px",display:"flex",gap:4,overflowX:"auto",borderBottom:"1px solid #c9b07022"}}>
              {TEA_TABS.map((t,i) => {
                const d = form ? done(form)[i] : false;
                return <button key={i} onClick={()=>setTab(i)} style={{padding:"7px 14px",fontSize:12,letterSpacing:1,borderRadius:20,cursor:"pointer",whiteSpace:"nowrap",border:"none",
                  background:tab===i?"#1c1510":d?"#2a2018":"transparent",color:tab===i?"#f5f0e8":d?"#c9b070":"#8a7060"}}>
                  {d&&tab!==i&&<span style={{color:"#c9b070",marginRight:4,fontSize:10}}>✓</span>}{t}</button>;
              })}
            </div>
            {/* Tab body */}
                        <LibraryTeaTabBody tab={tab} form={form} setF={setF} isMobile={isMobile} addRec={addRec} setRec={setRec} delRec={delRec}/>
            <div style={{padding:"14px 24px",borderTop:"1px solid #ede8de",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff8f2",flexShrink:0,zIndex:2}}>
              {modal==="edit"
                ? <button onClick={handleDel} style={{color:"#a05040",fontSize:12,letterSpacing:1,textDecoration:"underline",border:"none",background:"none",cursor:"pointer"}}>このお茶を削除</button>
                : <span/>}
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{display:"flex",gap:6}}>
                  {TEA_TABS.map((_,i)=>(
                    <button key={i} onClick={()=>setTab(i)} style={{
                      width:8,height:8,borderRadius:"50%",border:"none",cursor:"pointer",padding:0,
                      background:tab===i?"#1c1510":"#d0c8bc",
                    }}/>
                  ))}
                </div>
                <button disabled={!form?.名前?.trim()||saving} onClick={handleSave}
                  style={{background:"#1c1510",color:"#f5f0e8",borderRadius:7,padding:"11px 28px",
                    fontSize:13,letterSpacing:2,fontWeight:600,border:"none",cursor:"pointer",
                    opacity:!form?.名前?.trim()||saving?0.4:1}}>
                  {saving?"保存中…":modal==="add"?"全部保存する":"全部保存する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function ChayozineApp() {
  const now = new Date();
  const _next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [year,    setYear]   = useState(_next.getFullYear());
  const [month,   setMonth]  = useState(_next.getMonth() + 1);
  const [section, setSection]= useState("cover");
  const [notice,  setNotice] = useState("");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [teaModalOpen, setTeaModalOpen] = useState(false);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const notify = msg => { setNotice(msg); setTimeout(() => setNotice(""), 2400); };
  const prevMonth = () => month===1 ? (setYear(y=>y-1), setMonth(12)) : setMonth(m=>m-1);
  const nextMonth = () => month===12? (setYear(y=>y+1), setMonth(1))  : setMonth(m=>m+1);

  const renderSection = () => {
    switch(section) {
      case "teas":       return <TeaSection year={year} month={month} notify={notify} isMobile={isMobile} onModalChange={setTeaModalOpen}/>;
      case "library":    return <TeaLibrarySection notify={notify} isMobile={isMobile} onModalChange={setTeaModalOpen}/>;
      case "cover":      return <CoverSection year={year} month={month} notify={notify}/>;
      case "preface":    return <PrefaceSection year={year} month={month} notify={notify}/>;
      case "gift":       return <GiftSection year={year} month={month} notify={notify}/>;
      case "hiroko":     return <GenericColumn sectionId="hiroko" year={year} month={month} notify={notify}
                           title="茶左右記" subtitle="荒田博子コラム" showCaption={true}/>;
      case "pilgrimage": return <GenericColumn sectionId="pilgrimage" year={year} month={month} notify={notify}
                           title="茶景巡礼" subtitle="カンちゃんコラム" showCaption={true}/>;
      case "report":     return <MultiEntrySection sectionId="report" year={year} month={month} notify={notify}
                           title="活動レポート" subtitle="先月の活動報告 — 複数追加可" />;
      case "events":     return <MultiEntrySection sectionId="events" year={year} month={month} notify={notify}
                           title="活動予告" subtitle="今月のイベント情報 — 複数追加可" />;
      case "guest":      return <GuestColumn year={year} month={month} notify={notify} />;
      case "other":      return <GenericColumn sectionId="other" year={year} month={month} notify={notify}
                           title="その他" subtitle="Other" showCaption={true}/>;
      default: return null;
    }
  };

  return (
    <div style={{fontFamily:"'Noto Serif JP','Georgia',serif",background:"#faf6ee",minHeight:"100vh",color:"#1c1510",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;600&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        textarea,input,select{outline:none;font-family:inherit}
        button{cursor:pointer;font-family:inherit}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#c9b07044;border-radius:3px}
        @keyframes notif{0%{opacity:0;transform:translateY(8px)}15%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0}}

        .nav-item{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:8px;cursor:pointer;transition:all .15s;border:none;background:none;width:100%;text-align:left;font-family:inherit}
        .nav-item:hover{background:#2a2018}
        .nav-item.active{background:#c9b07022;border-left:2px solid #c9b070}
      `}</style>

      {/* Notification */}
      {notice && (
        <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",
          background:"#1c1510",color:"#c9b070",padding:"10px 24px",borderRadius:8,
          fontSize:13,letterSpacing:2,zIndex:9999,animation:"notif 2.4s ease forwards",whiteSpace:"nowrap"}}>
          {notice}
        </div>
      )}

      {/* ── Top Header ── */}
      <header style={{background:"#1c1510",height:54,display:"flex",alignItems:"center",
        padding:"0 24px",borderBottom:"1px solid #c9b07033",flexShrink:0,
        position:"sticky",top:0,zIndex:200}}>
        <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?16:24,letterSpacing:isMobile?2:4,color:"#c9b070",fontWeight:300}}>
          茶与人 {!isMobile && "CHAYOZINE"}
        </span>
        {!isMobile && <span style={{fontSize:10,color:"#7a6a5a",letterSpacing:3,textTransform:"uppercase",marginLeft:12}}>CMS</span>}

        {/* Month nav — centered */}
        <div style={{display:"flex",alignItems:"center",gap:isMobile?8:16,margin:"0 auto"}}>
          <button onClick={prevMonth} style={{background:"#2a2018",color:"#f5f0e8",width:30,height:30,
            borderRadius:"50%",fontSize:16,border:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <div style={{textAlign:"center",minWidth:isMobile?100:140}}>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?18:22,fontWeight:300,letterSpacing:isMobile?2:4,color:"#f5f0e8"}}>
              {MONTH_JA[month-1]}
            </span>
            <span style={{fontSize:11,color:"#c9b070",letterSpacing:2,marginLeft:8}}>{year}</span>
          </div>
          <button onClick={nextMonth} style={{background:"#2a2018",color:"#f5f0e8",width:30,height:30,
            borderRadius:"50%",fontSize:16,border:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
        </div>

        <div style={{fontSize:12,color:"#7a6a5a",marginLeft:"auto"}}>
          {MONTH_EN[month-1]} {year}
        </div>
      </header>

      {/* ── Body: Sidebar + Main ── */}
      <div style={{display:"flex",flex:1,minHeight:0}}>

        {/* Sidebar */}
        {!isMobile && (
          <nav style={{width:210,background:"#1c1510",flexShrink:0,overflowY:"auto",
            padding:"16px 12px",display:"flex",flexDirection:"column",gap:2}}>
            {NAV_SECTIONS.map((sec, si) => (
              <div key={si} style={{marginBottom:si<NAV_SECTIONS.length-1?14:0}}>
                <div style={{fontSize:10,color:"#7a6a5a",letterSpacing:3,textTransform:"uppercase",
                  padding:"6px 16px 8px",borderBottom:"1px solid #2a2018",marginBottom:6}}>
                  {sec.label}
                </div>
                {sec.items.map(item => (
                  <button key={item.id} onClick={() => setSection(item.id)}
                    className={`nav-item ${section===item.id?"active":""}`}>
                    <span style={{fontSize:16}}>{item.icon}</span>
                    <div>
                      <div style={{fontSize:13,color:section===item.id?"#c9b070":"#d0c8bc",letterSpacing:1,fontWeight:section===item.id?600:400}}>
                        {item.label}
                      </div>
                      <div style={{fontSize:10,color:"#7a6a5a",letterSpacing:1}}>{item.en}</div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}

        {/* Main content */}
        <main style={{flex:1,overflowY:"auto",padding:isMobile?"16px 16px 88px":"36px 40px 80px",maxWidth:960,width:"100%"}}>
          {renderSection()}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      {isMobile && !teaModalOpen && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,
          background:"#1c1510",borderTop:"1px solid #c9b07033",
          display:"flex",overflowX:"auto",zIndex:9999,
          WebkitOverflowScrolling:"touch",
          paddingBottom:"env(safe-area-inset-bottom)"}}>
          {NAV.map(item=>(
            <button key={item.id} onClick={()=>setSection(item.id)} style={{
              flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",
              gap:2,padding:"10px 14px",background:"none",border:"none",cursor:"pointer",
              borderTop:section===item.id?"2px solid #c9b070":"2px solid transparent",
            }}>
              <span style={{fontSize:22}}>{item.icon}</span>
              <span style={{fontSize:9,letterSpacing:0.5,
                color:section===item.id?"#c9b070":"#7a6a5a",whiteSpace:"nowrap"}}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
