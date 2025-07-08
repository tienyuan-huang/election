/**
 * @file script.js
 * @description 台灣選舉地圖視覺化工具的主要腳本。
 * @version 18.0.0
 * @date 2025-07-08
 * * 此版本新增了選區搜尋功能。
 * 主要改進：
 * 1.  **新增搜尋功能**: 使用者可透過關鍵字搜尋候選人或行政區，快速篩選選區列表。
 * 2.  **建立搜尋索引**: 資料處理流程中會建立一個包含多種關鍵字的搜尋索引。
 * 3.  **介面更新**: 新增搜尋輸入框，並讓選區下拉選單能根據搜尋結果即時更新。
 */

console.log('Running script.js version 18.0.0 with search functionality.');

// --- 全域變數與設定 ---

let map;
let geoJsonLayer, annotationLayer;
let infoPanel, yearSelector, districtSelector, annotationList, exportCsvBtn, exportKmlBtn, showHelpBtn;
let voteChart = null;

let infoToggle, infoContainer, mapContainer, collapsibleContent, toggleText, toggleIconCollapse, toggleIconExpand;

// 新增：搜尋功能相關 DOM 元素
let searchInput, clearSearchBtn;

let currentGeoData = null;
let villageResults = {}; 
let districtResults = {}; 
let geoKeyToDistrictMap = {};
let currentSelectedDistrict = 'all'; 

let annotations = {};

const KMT_PARTY_NAME = '中國國民黨';
const DPP_PARTY_NAME = '民主進步黨';

const RECALL_DISTRICTS = [
    '臺東縣第01選區', '臺北市第08選區', '臺北市第07選區', '臺北市第06選區',
    '臺北市第04選區', '臺北市第03選區', '臺中市第08選區', '臺中市第06選區',
    '臺中市第05選區', '臺中市第04選區', '臺中市第03選區', '臺中市第02選區',
    '彰化縣第03選區', '新竹縣第02選區', '新竹縣第01選區', '新竹市第01選區',
    '新北市第09選區', '新北市第08選區', '新北市第07選區', '新北市第12選區',
    '新北市第11選區', '新北市第01選區', '雲林縣第01選區', '基隆市第01選區',
    '桃園市第06選區', '桃園市第05選區', '桃園市第04選區', '桃園市第03選區',
    '桃園市第02選區', '桃園市第01選區', '苗栗縣第02選區', '苗栗縣第01選區',
    '南投縣第02選區', '南投縣第01選區', '花蓮縣第01選區'
];

const dataSources = {
    '2024': { votes: 'data/2024/regional_legislator_votes.csv', geo: 'data/village.geojson' },
    '2020': { votes: 'data/2020/regional_legislator_votes.csv', geo: 'data/village.geojson' },
    '2016': { votes: 'data/2016/regional_legislator_votes.csv', geo: 'data/village.geojson' },
};

// --- 初始化與事件監聽 ---

document.addEventListener('DOMContentLoaded', function() {
    infoPanel = document.getElementById('info-panel');
    yearSelector = document.getElementById('year-selector');
    districtSelector = document.getElementById('district-selector');
    annotationList = document.getElementById('annotation-list');
    exportCsvBtn = document.getElementById('export-csv-btn');
    exportKmlBtn = document.getElementById('export-kml-btn');
    showHelpBtn = document.getElementById('show-help-btn');

    infoToggle = document.getElementById('info-toggle');
    infoContainer = document.getElementById('info-container');
    mapContainer = document.getElementById('map-container');
    collapsibleContent = document.getElementById('collapsible-content');
    toggleText = document.getElementById('toggle-text');
    toggleIconCollapse = document.getElementById('toggle-icon-collapse');
    toggleIconExpand = document.getElementById('toggle-icon-expand');

    // 獲取搜尋相關元素
    searchInput = document.getElementById('search-input');
    clearSearchBtn = document.getElementById('clear-search-btn');

    initializeMap();
    setupEventListeners();
    checkAndShowWelcomeModal();
    loadAndDisplayYear(yearSelector.value);
    renderAnnotationList();
});

function initializeMap() {
    map = L.map('map').setView([23.9738, 120.982], 7.5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    annotationLayer = L.layerGroup().addTo(map);
}

function setupEventListeners() {
    districtSelector.addEventListener('change', (e) => {
        currentSelectedDistrict = e.target.value;
        renderMapLayers();
        resetInfoPanel();
    });
    yearSelector.addEventListener('change', (e) => loadAndDisplayYear(e.target.value));
    exportCsvBtn.addEventListener('click', exportToCSV);
    exportKmlBtn.addEventListener('click', exportToKML);

    const modal = document.getElementById('welcome-modal');
    const closeBtn = document.getElementById('close-welcome-modal-btn');
    
    showHelpBtn.addEventListener('click', showWelcomeModal);
    closeBtn.addEventListener('click', closeWelcomeModal);
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'welcome-modal') {
            closeWelcomeModal();
        }
    });

    if(infoToggle) {
        infoToggle.addEventListener('click', toggleInfoPanel);
    }

    // *** 新增：搜尋功能的事件監聽 ***
    searchInput.addEventListener('input', handleSearch);
    clearSearchBtn.addEventListener('click', clearSearch);
}

// --- 搜尋功能函式 ---
function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
        populateDistrictFilter();
        return;
    }

    const matchedDistricts = RECALL_DISTRICTS.filter(districtName => {
        const districtData = districtResults[districtName];
        return districtData && districtData.searchableString.toLowerCase().includes(query);
    });

    populateDistrictFilter(matchedDistricts);
    // 自動觸發 change 事件以更新地圖
    districtSelector.dispatchEvent(new Event('change'));
}

function clearSearch() {
    searchInput.value = '';
    populateDistrictFilter();
    districtSelector.value = 'all'; // 重設為顯示全部
    districtSelector.dispatchEvent(new Event('change'));
}


// --- 資訊面板收合功能 ---
function toggleInfoPanel() {
    const isCollapsed = collapsibleContent.classList.contains('hidden');

    if (isCollapsed) {
        infoContainer.classList.remove('h-auto');
        infoContainer.classList.add('h-1/2');
        mapContainer.classList.remove('h-full');
        mapContainer.classList.add('h-1/2');
        collapsibleContent.classList.remove('hidden');
        
        toggleText.textContent = '收合資訊面板';
        toggleIconCollapse.classList.remove('hidden');
        toggleIconExpand.classList.add('hidden');

    } else {
        infoContainer.classList.remove('h-1/2');
        infoContainer.classList.add('h-auto');
        mapContainer.classList.remove('h-1/2');
        mapContainer.classList.add('h-full');
        collapsibleContent.classList.add('hidden');

        toggleText.textContent = '展開資訊面板';
        toggleIconCollapse.classList.add('hidden');
        toggleIconExpand.classList.remove('hidden');
    }

    setTimeout(() => {
        if (map) {
            map.invalidateSize(true);
        }
    }, 500);
}


// --- 歡迎視窗處理函式 ---
function showWelcomeModal() {
    const modal = document.getElementById('welcome-modal');
    modal.classList.remove('hidden');
}

function closeWelcomeModal() {
    const modal = document.getElementById('welcome-modal');
    modal.classList.add('hidden');
    sessionStorage.setItem('welcomeShown', 'true');
}

function checkAndShowWelcomeModal() {
    if (!sessionStorage.getItem('welcomeShown')) {
        showWelcomeModal();
    }
}


// --- 主要資料處理函式 ---
async function loadAndDisplayYear(year) {
    const source = dataSources[year];
    if (!source) return console.error(`找不到 ${year} 年的資料來源設定。`);
    clearUI();
    setLoadingState(true);
    try {
        const [geoData, voteDataRows] = await Promise.all([
            currentGeoData || fetch(source.geo).then(res => {
                if (!res.ok) throw new Error(`地理圖資檔案 ${source.geo} 載入失敗 (HTTP ${res.status})。`);
                return res.json();
            }),
            new Promise((resolve, reject) => {
                Papa.parse(source.votes, {
                    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
                    complete: res => res.errors.length ? reject(res.errors[0]) : resolve(res.data),
                    error: err => reject(new Error(`無法讀取 CSV: ${err.message}`))
                });
            })
        ]);
        currentGeoData = geoData;
        const requiredKeys = ['geo_key', 'electoral_district_name', 'candidate_name', 'party_name', 'votes', 'electorate', 'total_votes', 'county_name', 'township_name'];
        if (!voteDataRows[0] || requiredKeys.some(key => !voteDataRows[0].hasOwnProperty(key))) {
            throw new Error(`CSV 檔案缺少必要欄位，請確認包含: ${requiredKeys.join(', ')}`);
        }
        processVoteData(voteDataRows);
        populateDistrictFilter(); // 使用完整列表初始化
        renderMapLayers();
    } catch (error) {
        console.error(`[錯誤] 處理 ${year} 年資料時發生嚴重錯誤:`, error);
        infoPanel.innerHTML = `<div class="p-4"><h2 class="text-2xl font-bold text-red-600">資料處理失敗</h2><p class="text-gray-500 mt-2">請按 F12 打開開發者工具查看詳細錯誤訊息。</p><p class="text-gray-600 mt-1 text-sm bg-red-50 p-2 rounded">${error.message}</p></div>`;
    } finally {
        setLoadingState(false);
    }
}

function processVoteData(voteData) {
    villageResults = {}; districtResults = {}; geoKeyToDistrictMap = {};
    const recallDistrictSet = new Set(RECALL_DISTRICTS);
    const filteredVoteData = voteData.filter(row => row.electoral_district_name && recallDistrictSet.has(row.electoral_district_name));
    
    // *** 新增：建立行政區和候選人的索引 ***
    const districtTownships = {}; // e.g. { "臺北市第01選區": Set("士林區", "北投區") }

    filteredVoteData.forEach(row => {
        const { electoral_district_name, candidate_name, party_name, votes, township_name } = row;
        if (!electoral_district_name) return;

        // 建立選區-行政區對照
        if (!districtTownships[electoral_district_name]) {
            districtTownships[electoral_district_name] = new Set();
        }
        districtTownships[electoral_district_name].add(township_name);

        // 累計候選人票數
        if (!districtResults[electoral_district_name]) {
            districtResults[electoral_district_name] = { candidates: {} };
        }
        const currentVotes = districtResults[electoral_district_name].candidates[candidate_name] || { votes: 0, party: party_name };
        currentVotes.votes += votes || 0;
        districtResults[electoral_district_name].candidates[candidate_name] = currentVotes;
    });

    // *** 新增：為每個選區建立可搜尋的字串 ***
    for (const districtName in districtResults) {
        const district = districtResults[districtName];
        const candidatesString = Object.keys(district.candidates).join(' ');
        const townshipsString = Array.from(districtTownships[districtName] || []).join(' ');
        // searchableString 包含：選區名、行政區名、候選人名
        district.searchableString = `${districtName} ${townshipsString} ${candidatesString}`;
    }

    // (其餘處理邏輯不變)
    for (const districtName in districtResults) {
        const district = districtResults[districtName];
        const sortedCandidates = Object.entries(district.candidates).sort((a, b) => b[1].votes - a[1].votes);
        if (sortedCandidates.length > 0) { district.winner = sortedCandidates[0][0]; district.winnerParty = sortedCandidates[0][1].party; }
    }

    filteredVoteData.forEach(row => {
        const { geo_key, electoral_district_name, county_name, township_name, village_name, electorate, total_votes } = row;
        if (!geo_key || !electoral_district_name) return;
        if (!villageResults[geo_key]) {
            const districtWinner = districtResults[electoral_district_name];
            villageResults[geo_key] = {
                geo_key, 
                fullName: `${county_name} ${township_name} ${village_name}`, 
                districtName: electoral_district_name, 
                electorate: electorate || 0,
                total_votes: total_votes || 0,
                candidates: [],
                districtWinnerName: districtWinner ? districtWinner.winner : 'N/A', 
                districtWinnerParty: districtWinner ? districtWinner.winnerParty : 'N/A',
            };
        }
        villageResults[geo_key].candidates.push({ name: row.candidate_name, party: row.party_name, votes: row.votes || 0 });
        geoKeyToDistrictMap[geo_key] = electoral_district_name;
    });

    for (const key in villageResults) {
        const village = villageResults[key];
        village.candidates.sort((a, b) => b.votes - a.votes);
        village.leader = village.candidates.length > 0 ? village.candidates[0] : null;
        village.runnerUp = village.candidates.length > 1 ? village.candidates[1] : null;
    }
}


// --- 地圖與 UI 渲染函式 ---

function renderMapLayers() {
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);
    
    // 根據選區選擇器決定要顯示哪些村里
    const selectedDistrict = districtSelector.value;
    const isMultiSelect = districtSelector.options.length > 2 && selectedDistrict === 'all';

    geoJsonLayer = L.geoJSON(currentGeoData, {
        filter: feature => {
            const villCode = feature.properties.VILLCODE;
            const districtName = geoKeyToDistrictMap[villCode];
            if (!districtName) return false;

            if (isMultiSelect) {
                // 如果是多選模式（搜尋結果），則顯示所有符合的選區
                return Array.from(districtSelector.options).some(opt => opt.value === districtName);
            } else {
                // 單選或預設的 "all" 模式
                return selectedDistrict === "all" || districtName === selectedDistrict;
            }
        },
        style: feature => {
            const villCode = feature.properties.VILLCODE;
            const village = villageResults[villCode];
            const color = village ? getColor(village) : '#cccccc';
            return { fillColor: color, weight: 0.5, opacity: 1, color: 'white', fillOpacity: 0.7 };
        },
        onEachFeature: (feature, layer) => {
            const villCode = feature.properties.VILLCODE;
            const village = villageResults[villCode];
            if (village) {
                layer.bindTooltip(`${village.fullName}<br>選區當選人: ${village.districtWinnerName}`);
                layer.on({
                    mouseover: e => e.target.setStyle({ weight: 2, color: '#333' }),
                    mouseout: e => geoJsonLayer.resetStyle(e.target),
                    click: e => {
                        updateInfoPanel(village, layer);
                    }
                });
            }
        }
    }).addTo(map);

    if (geoJsonLayer.getLayers().length > 0) {
        map.fitBounds(geoJsonLayer.getBounds());
    }
}

// *** 修改：讓此函式可以接受要顯示的選區列表 ***
function populateDistrictFilter(districtsToShow = RECALL_DISTRICTS) {
    const originalValue = districtSelector.value;
    districtSelector.innerHTML = ''; // 清空現有選項

    // 根據傳入的列表長度決定是否顯示 "所有..." 選項
    if (districtsToShow.length > 1) {
        const allOption = document.createElement('option');
        allOption.value = "all";
        allOption.textContent = `所有符合的選區 (${districtsToShow.length})`;
        districtSelector.appendChild(allOption);
    } else if (districtsToShow.length === 0) {
        const noResultOption = document.createElement('option');
        noResultOption.value = "none";
        noResultOption.textContent = "無符合的選區";
        districtSelector.appendChild(noResultOption);
    }

    // 填充選區選項
    districtsToShow.sort((a, b) => a.localeCompare(b, 'zh-Hant')).forEach(districtName => {
        const option = document.createElement('option');
        option.value = districtName;
        option.textContent = districtName;
        districtSelector.appendChild(option);
    });

    // 嘗試還原之前的選項，如果還存在的話
    if (Array.from(districtSelector.options).some(opt => opt.value === originalValue)) {
        districtSelector.value = originalValue;
    } else if (districtsToShow.length === 1) {
        // 如果只有一個結果，就直接選取它
        districtSelector.value = districtsToShow[0];
    }
}


function getColor(village) {
    if (!village || !village.leader || !village.runnerUp || !village.electorate || village.electorate === 0) {
        return '#cccccc';
    }
    const leaderTurnout = village.leader.votes / village.electorate;
    const runnerUpTurnout = village.runnerUp.votes / village.electorate;
    const turnoutDiff = Math.abs(leaderTurnout - runnerUpTurnout);

    if (turnoutDiff < 0.05) {
        return '#ef4444'; 
    }

    if (village.leader.party === KMT_PARTY_NAME) {
        return '#3b82f6';
    } else if (village.leader.party === DPP_PARTY_NAME) {
        return '#16a34a';
    } else {
        return 'rgba(0, 0, 0, 0.4)';
    }
}

function updateInfoPanel(village, layer) {
    const leader = village.leader;
    const runnerUp = village.runnerUp;
    const leaderTurnout = village.electorate > 0 && leader ? (leader.votes / village.electorate * 100).toFixed(2) : 0;
    const runnerUpTurnout = village.electorate > 0 && runnerUp ? (runnerUp.votes / village.electorate * 100).toFixed(2) : 0;
    
    const nonVoterCount = village.electorate - village.total_votes;
    const nonVoterRate = village.electorate > 0 ? (nonVoterCount / village.electorate * 100).toFixed(2) : 0;

    const existingAnnotation = annotations[village.geo_key]?.note || '';
    const annotationHTML = `
        <div class="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <label for="annotation-input" class="block text-sm font-bold text-gray-700 mb-1">新增/編輯註解</label>
            <textarea id="annotation-input" class="w-full p-2 border border-gray-300 rounded-md" rows="3">${existingAnnotation}</textarea>
            <div class="flex justify-end space-x-2 mt-2">
                <button id="delete-annotation-btn" class="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-sm">刪除</button>
                <button id="save-annotation-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-1 px-3 rounded text-sm">儲存</button>
            </div>
        </div>
    `;

    infoPanel.innerHTML = `
        <div class="p-4">
            <h2 class="text-2xl font-bold text-gray-800 mb-1">${village.fullName}</h2>
            <p class="text-sm text-gray-500 mb-4">所屬選區: ${village.districtName}</p>
            <div class="bg-blue-50 border-l-4 border-blue-500 p-3 mb-4 rounded">
                <p class="font-bold text-blue-800">選區當選人: ${village.districtWinnerName} (${village.districtWinnerParty})</p>
            </div>
            
            <div class="bg-gray-50 border-l-4 border-gray-500 p-3 mb-4 rounded">
                <p class="font-bold text-gray-800">此村里投票狀況</p>
                <div class="flex justify-between items-center text-sm text-gray-600 mt-1">
                    <span>未投票人數 (潛在動員空間)</span>
                    <span class="font-semibold">${nonVoterCount.toLocaleString()} 人</span>
                </div>
                <div class="flex justify-between items-center text-sm text-gray-600">
                    <span>未投票率</span>
                    <span class="font-semibold">${nonVoterRate}%</span>
                </div>
            </div>

            <div class="mb-4">
                <div class="flex justify-between items-center mb-1"><span class="font-semibold text-gray-700">此村里領先者: ${leader ? leader.name : 'N/A'}</span><span class="text-lg font-bold text-gray-800">${leader ? leader.votes.toLocaleString() : 0} 票</span></div>
                <div class="flex justify-between items-center text-sm text-gray-600"><span>催票率</span><span>${leaderTurnout}%</span></div>
            </div>
            <div class="mb-4">
                <div class="flex justify-between items-center mb-1"><span class="font-semibold text-gray-700">此村里第二名: ${runnerUp ? runnerUp.name : 'N/A'}</span><span class="text-lg font-bold text-gray-800">${runnerUp ? runnerUp.votes.toLocaleString() : 0} 票</span></div>
                <div class="flex justify-between items-center text-sm text-gray-600"><span>催票率</span><span>${runnerUpTurnout}%</span></div>
            </div>
            <div class="mt-4 h-64"><canvas id="vote-chart"></canvas></div>
            ${annotationHTML}
        </div>
    `;

    document.getElementById('save-annotation-btn').addEventListener('click', () => {
        const note = document.getElementById('annotation-input').value;
        const center = layer.getBounds().getCenter();
        saveAnnotation(village.geo_key, village.fullName, note, center.lat, center.lng);
    });
    document.getElementById('delete-annotation-btn').addEventListener('click', () => {
        deleteAnnotation(village.geo_key);
        document.getElementById('annotation-input').value = '';
    });

    if (voteChart) voteChart.destroy();
    const ctx = document.getElementById('vote-chart').getContext('2d');
    
    voteChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: village.candidates.map(c => c.name),
            datasets: [{
                label: '得票數', 
                data: village.candidates.map(c => c.votes),
                backgroundColor: village.candidates.map(c => {
                    if (c.party === KMT_PARTY_NAME) return 'rgba(59, 130, 246, 0.7)';
                    if (c.party === DPP_PARTY_NAME) return 'rgba(22, 163, 74, 0.7)';
                    return 'rgba(128, 128, 128, 0.7)';
                }),
                borderColor: village.candidates.map(c => {
                    if (c.party === KMT_PARTY_NAME) return 'rgba(37, 99, 235, 1)';
                    if (c.party === DPP_PARTY_NAME) return 'rgba(21, 128, 61, 1)';
                    return 'rgba(107, 114, 128, 1)';
                }),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            scales: { 
                x: { 
                    beginAtZero: true, 
                    ticks: { callback: value => typeof value === 'number' ? value.toLocaleString() : value } 
                } 
            },
            plugins: { legend: { display: false }, title: { display: true, text: '此村里各候選人得票數' } }
        }
    });
}

function resetInfoPanel() {
    if (voteChart) { voteChart.destroy(); voteChart = null; }
    infoPanel.innerHTML = `<div class="p-4"><h2 class="text-2xl font-bold text-gray-800">請選擇一個村里</h2><p class="text-gray-500">點擊地圖上的區塊來查看該村里的詳細選舉資料與新增標註。</p></div>`;
}

function clearUI() {
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);
    resetInfoPanel();
}

function setLoadingState(isLoading) {
    if (isLoading) {
        infoPanel.innerHTML = `<div class="p-4"><h2 class="text-2xl font-bold text-gray-800 animate-pulse">資料載入中...</h2><p class="text-gray-500">正在處理選舉與地理圖資，請稍候。</p></div>`;
    } else {
        resetInfoPanel();
    }
}

// --- 標註管理函式 ---

function saveAnnotation(geoKey, name, note, lat, lng) {
    if (!note.trim()) {
        deleteAnnotation(geoKey);
        return;
    }
    annotations[geoKey] = { name, note, lat, lng };
    addOrUpdateMarker(geoKey);
    renderAnnotationList();
    alert(`已儲存對「${name}」的註解！`);
}

function deleteAnnotation(geoKey) {
    if (annotations[geoKey]) {
        delete annotations[geoKey];
        addOrUpdateMarker(geoKey);
        renderAnnotationList();
        alert('註解已刪除！');
    }
}

function addOrUpdateMarker(geoKey) {
    const annotation = annotations[geoKey];
    
    annotationLayer.eachLayer(layer => {
        if (layer.options.geoKey === geoKey) {
            annotationLayer.removeLayer(layer);
        }
    });

    if (annotation) {
        const marker = L.marker([annotation.lat, annotation.lng], { geoKey: geoKey });
        marker.bindPopup(`<b>${annotation.name}</b><br>${annotation.note}`);
        annotationLayer.addLayer(marker);
    }
}

function renderAnnotationList() {
    annotationList.innerHTML = '';
    const keys = Object.keys(annotations);

    if (keys.length === 0) {
        annotationList.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">尚未新增任何標註。</p>';
        return;
    }

    keys.forEach(geoKey => {
        const annotation = annotations[geoKey];
        const item = document.createElement('div');
        item.className = 'p-2 border-b border-gray-200 cursor-pointer hover:bg-gray-100';
        item.innerHTML = `<p class="font-semibold text-sm">${annotation.name}</p><p class="text-xs text-gray-600 truncate">${annotation.note}</p>`;
        item.addEventListener('click', () => {
            map.setView([annotation.lat, annotation.lng], 15);
        });
        annotationList.appendChild(item);
    });
}

// --- 匯出功能函式 ---

function downloadFile(content, fileName, mimeType) {
    const a = document.createElement('a');
    const blob = new Blob([content], { type: mimeType });
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function exportToCSV() {
    if (Object.keys(annotations).length === 0) {
        alert('沒有可匯出的標註！');
        return;
    }
    const headers = ['name', 'latitude', 'longitude', 'note'];
    const rows = Object.values(annotations).map(a => [a.name, a.lat, a.lng, `"${a.note.replace(/"/g, '""')}"`]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    downloadFile(csvContent, 'annotations.csv', 'text/csv;charset=utf-8;');
}

function exportToKML() {
    if (Object.keys(annotations).length === 0) {
        alert('沒有可匯出的標註！');
        return;
    }
    const kmlPlacemarks = Object.values(annotations).map(a => `
        <Placemark>
            <name>${a.name}</name>
            <description>${a.note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</description>
            <Point>
                <coordinates>${a.lng},${a.lat},0</coordinates>
            </Point>
        </Placemark>
    `).join('');

    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
        <name>我的地圖標註</name>
        ${kmlPlacemarks}
    </Document>
</kml>`;
    downloadFile(kmlContent, 'application/vnd.google-earth.kml+xml');
}
