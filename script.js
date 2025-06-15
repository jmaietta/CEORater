/* ------------------------------------------------------------
   CEORater • script.js          (no backend required)
   ------------------------------------------------------------
   • Fetches the CSV already in the repo
   • Parses it with Papa Parse   (index.html now loads the CDN)
   • Fills your styled table, filter buttons, and video popup
------------------------------------------------------------- */

/* ---------- CONFIG ---------- */
const CSV_PATH = "/CEORater%20CSV%20for%20Upload.csv"; // (%20 = space)

/* ---------- DOM SHORTCUTS ---------- */
const tbody          = document.getElementById("ceoTableBody");
const filterTabs     = document.getElementById("filterTabs");
const popup          = document.getElementById("mediaPopup");
const popupOverlay   = document.getElementById("popupOverlay");
const popupCeoName   = document.getElementById("popupCeoName");
const popupMediaCont = document.getElementById("popupMediaContent");
const closePopupBtn  = document.getElementById("closePopup");
const lastUpdated    = document.getElementById("lastUpdated");

/* ---------- STATE ---------- */
let allRows = [];              // full dataset
let media   = {};              // CEO → array of URLs
let active  = "all";           // current tab

/* ---------- SMALL HELPERS ---------- */
const pct  = (v) => (v ? `${v}%` : "N/A");
const money= (m)=> (m?`$${Number(m).toLocaleString()} MM`:"N/A");
const tenure = (d)=>{
  if(!d)return"N/A";
  const s=new Date(d);if(isNaN(s))return"N/A";
  const n=new Date();let y=n.getFullYear()-s.getFullYear();
  let m=n.getMonth()-s.getMonth();if(m<0){y--;m+=12}
  return`${y}.${m} yrs`;
};

/* ---------- BUILD ONE TABLE ROW ---------- */
function rowHTML(ceo, i){
  const posRet=!String(ceo["Total Stock Return"]).startsWith("-");
  const founder=(ceo["Founder (Y/N)"]||"").trim().toUpperCase()==="Y";
  const ytCnt=+(ceo["YouTube Count"]||0);
  return`
  <td class="px-6 py-4">${i+1}</td>
  <td class="px-6 py-4">
      <div class="font-semibold">${ceo["CEO Name"]}</div>
      <div class="text-sm text-gray-500">${ceo["Company Name"]} (${ceo["Ticker"]})</div>
      ${founder?'<span class="inline-block mt-1 text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">Founder</span>':""}
  </td>
  <td class="px-6 py-4">${tenure(ceo["CEO Start Date"])}</td>
  <td class="px-6 py-4 font-semibold ${posRet?"text-green-600":"text-red-600"}">
      ${pct(ceo["Total Stock Return"])}
  </td>
  <td class="px-6 py-4">${ceo["Equity Ownership %"]||"N/A"}</td>
  <td class="px-6 py-4">${ceo["Insider Score"]||"N/A"}</td>
  <td class="px-6 py-4">
    ${ytCnt
      ? `<button class="view-vid text-blue-600 underline" data-ceo="${ceo["CEO Name"]}">Videos (${ytCnt})</button>`
      : '<span class="text-gray-400">None</span>'}
  </td>
  <td class="px-6 py-4 font-bold">${ceo["Total Score"]||"N/A"}</td>`;
}

/* ---------- TABLE RENDER ---------- */
function render(tab=active){
  active=tab;
  tbody.innerHTML="";
  document.querySelectorAll("#filterTabs button").forEach(b=>{
    b.classList.toggle("tab-active",b.dataset.filter===tab);
  });

  const show=allRows.filter(r=>{
    if(tab==="top")       return +r["Total Score"]>=80;
    if(tab==="ownership") return parseFloat(r["Equity Ownership %"])>1;
    if(tab==="insider")   return +r["Insider Score"]>0;
    if(tab==="flags")     return +r["Insider Score"]<0;
    return true; // 'all'
  });

  if(!show.length){
    tbody.innerHTML=`<tr><td colspan="8" class="p-6 text-center text-gray-500">No CEOs match this filter.</td></tr>`;
    return;
  }

  show.forEach((c,i)=>{
    const tr=document.createElement("tr");
    tr.className=i%2?"bg-gray-50":"";
    tr.innerHTML=rowHTML(c,i);
    tbody.appendChild(tr);
  });
}

/* ---------- MEDIA POPUP ---------- */
function openPopup(name){
  const list=media[name]||[];
  popupCeoName.textContent=`${name}'s Media`;
  popupMediaCont.innerHTML=list.length
    ? list.map((u,i)=>`<a href="${u}" target="_blank" class="block mb-2 text-blue-600 underline">Video ${i+1}</a>`).join("")
    : "<p class='text-gray-500'>No recent media.</p>";
  popup.classList.remove("translate-x-full");
  popupOverlay.classList.remove("hidden");
}
const closePopup=()=>{popup.classList.add("translate-x-full");popupOverlay.classList.add("hidden");};

/* ---------- EVENT HANDLERS ---------- */
filterTabs.addEventListener("click",e=>{
  if(e.target.tagName==="BUTTON")render(e.target.dataset.filter);
});
tbody.addEventListener("click",e=>{
  if(e.target.classList.contains("view-vid"))openPopup(e.target.dataset.ceo);
});
closePopupBtn.addEventListener("click",closePopup);
popupOverlay.addEventListener("click",closePopup);

/* ---------- BOOT ---------- */
tbody.innerHTML='<tr><td colspan="8" class="p-6 text-center text-gray-500">Loading…</td></tr>';

fetch(CSV_PATH)
  .then(r=>r.text())
  .then(txt=>{
    const parsed=Papa.parse(txt,{header:true,skipEmptyLines:true});
    allRows=parsed.data;
    parsed.data.forEach(row=>{
      media[row["CEO Name"]]=(row["YouTube URLs"]||"").split(",").map(u=>u.trim()).filter(Boolean);
    });
    lastUpdated.textContent="just now";
    render("all");
  })
  .catch(e=>{
    tbody.innerHTML=`<tr><td colspan="8" class="p-6 text-center text-red-600">Couldn't load CSV: ${e}</td></tr>`;
  });
