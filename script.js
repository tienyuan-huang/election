/**
 * @file script.js
 * @description 台灣選舉地圖視覺化工具的主要腳本。
 * @version 6.0.0
 * @date 2025-07-08
 * * 此版本根據使用者回饋進行了重大功能更新。
 * 主要改進：
 * 1.  **村里獨立著色**: 地圖顏色現在根據每個「村里」的選票差距計算，而非整個選區。
 * 2.  **改用催票率**: 資訊面板中的「得票率」已全面改為「催票率」(計算公式: 票數 / 選舉人數)。
 * 3.  **移除選區列表**: 為了簡化介面並解決遮擋問題，已移除右側的選區列表功能。
 * 4.  **重構資料處理**: `processVoteData` 函式已重構，以村里 (geo_key) 為單位彙整資料。
 */

// --- 全域變數與設定 ---

let map;
let geoJsonLayer;
let infoPanel, yearSelector, districtSelector;
let voteChart = null;

// 存放當前載入的資料
let currentGeoData = null;
let villageResults = {}; // **新**: 以村里 geo_key 為核心的資料結構
let districtSummary = {}; // 用於選區下拉選單
let geoKeyToDistrictMap = {}; // 用於連結村里與選區

const dataSources = {
    '2024': { votes: 'data/2024/regional_legislator_votes.csv', geo: 'data/village.geojson' },
    '2020': { votes: 'data/2020/regional_legislator_votes.csv', geo: 'data/village.geojson' },
    '2016': { votes: 'data/2016/regional_legislator_votes.csv', geo: 'data/village.geojson' },
    '2012': { votes: 'data/2012/regional_legislator_votes.csv', geo: 'data/village.geojson' },
};

// --- 初始化與事件監聽 ---

document.addEventListener('DOMContentLoaded', function() {
    infoPanel = document.getElementById('info-panel');
    yearSelector = document.getElementById('year-selector');
    districtSelector = document.getElementById('district-selector');

    initializeMap();
    setupEventListeners();
    loadAndDisplayYear(yearSelector.value);
});

function initializeMap() {
    map = L.map('map').setView([23.9738, 120.982], 7.5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
}

function setupEventListeners() {
    yearSelector.addEventListener('change', (e) => loadAndDisplayYear(e.target.value));
    districtSelector.addEventListener('change', (e) => filterMapByDistrict(e.target.value));
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

        const requiredKeys = ['geo_key', 'electoral_district_name', 'candidate_name', 'votes', 'electorate'];
        if (!voteDataRows[0] || requiredKeys.some(key => !voteDataRows[0].hasOwnProperty(key))) {
            throw new Error(`CSV 檔案缺少必要欄位，請確認包含: ${requiredKeys.join(', ')}`);
        }

        processVoteData(voteDataRows);
        
        populateDistrictFilter();
        renderMapLayers();

    } catch (error) {
        console.error(`[錯誤] 處理 ${year} 年資料時發生嚴重錯誤:`, error);
        infoPanel.innerHTML = `<div class="p-4"><h2 class="text-2xl font-bold text-red-600">資料處理失敗</h2>
                               <p class="text-gray-500 mt-2">請按 F12 打開開發者工具查看詳細錯誤訊息。</p>
                               <p class="text-gray-600 mt-1 text-sm bg-red-50 p-2 rounded">${error.message}</p></div>`;
    } finally {
        setLoadingState(false);
    }
}

/**
 * @description **核心改動**: 以村里為單位彙整選舉資料
 * @param {Array<Object>} voteData - 從 CSV 載入的選舉資料
 */
function processVoteData(voteData) {
    // 重置資料容器
    villageResults = {};
    districtSummary = {};
    geoKeyToDistrictMap = {};

    // 第一次遍歷：收集每個村里的原始數據
    voteData.forEach(row => {
        const { geo_key, electoral_district_name, county_name, township_name, village_name, electorate } = row;
        if (!geo_key || !electoral_district_name) return;

        // 初始化村里資料物件
        if (!villageResults[geo_key]) {
            villageResults[geo_key] = {
                geo_key,
                fullName: `${county_name} ${township_name} ${village_name}`,
                districtName: electoral_district_name,
                electorate: electorate || 0,
                candidates: [],
            };
        }
        
        // 新增候選人資料
        villageResults[geo_key].candidates.push({
            name: row.candidate_name,
            party: row.party_name,
            votes: row.votes || 0,
        });

        // 建立選區與村里的對應關係
        if (!districtSummary[electoral_district_name]) {
            districtSummary[electoral_district_name] = true; // 僅用於產生下拉選單
        }
        geoKeyToDistrictMap[geo_key] = electoral_district_name;
    });

    // 第二次遍歷：計算每個村里的最終結果
    for (const key in villageResults) {
        const village = villageResults[key];
        
        // 根據票數對候選人進行排序
        village.candidates.sort((a, b) => b.votes - a.votes);
        
        const sortedCands = village.candidates;
        village.winner = sortedCands.length > 0 ? sortedCands[0].name : 'N/A';
        village.winner_votes = sortedCands.length > 0 ? sortedCands[0].votes : 0;
        village.opponent = sortedCands.length > 1 ? sortedCands[1].name : 'N/A';
        village.opponent_votes = sortedCands.length > 1 ? sortedCands[1].votes : 0;
        
        // 計算用於著色的差距百分比
        const margin = village.winner_votes - village.opponent_votes;
        const totalValidVotes = village.winner_votes + village.opponent_votes;
        village.marginPercentage = totalValidVotes > 0 ? margin / totalValidVotes : 0;
    }
}

// --- 地圖與 UI 渲染函式 ---

function renderMapLayers(districtFilter = "all") {
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);

    geoJsonLayer = L.geoJSON(currentGeoData, {
        filter: feature => {
            if (districtFilter === "all") return true;
            const villCode = feature.properties.VILLCODE;
            return geoKeyToDistrictMap[villCode] === districtFilter;
        },
        style: feature => {
            const villCode = feature.properties.VILLCODE;
            const village = villageResults[villCode];
            
            // **核心改動**: 根據每個村里的差距來決定顏色
            const color = village ? getColor(village.marginPercentage) : '#cccccc';
            
            return { fillColor: color, weight: 0.5, opacity: 1, color: 'white', fillOpacity: 0.7 };
        },
        onEachFeature: (feature, layer) => {
            const villCode = feature.properties.VILLCODE;
            const village = villageResults[villCode];

            if (village) {
                layer.bindTooltip(`${village.fullName}<br>當選者: ${village.winner}`);
                layer.on({
                    mouseover: e => e.target.setStyle({ weight: 2, color: '#333' }),
                    mouseout: e => geoJsonLayer.resetStyle(e.target),
                    click: e => {
                        updateInfoPanel(village); // 點擊時傳入村里資料
                        map.fitBounds(e.target.getBounds());
                    }
                });
            }
        }
    }).addTo(map);

    if (districtFilter !== "all" && geoJsonLayer.getLayers().length > 0) {
        map.fitBounds(geoJsonLayer.getBounds());
    }
}

function filterMapByDistrict(selectedDistrict) {
    renderMapLayers(selectedDistrict);
    resetInfoPanel(); // 切換選區時，重置右側資訊面板
    if (selectedDistrict === "all") {
        map.setView([23.9738, 120.982], 7.5);
    }
}

function populateDistrictFilter() {
    districtSelector.innerHTML = '<option value="all">所有選區</option>';
    Object.keys(districtSummary).sort((a, b) => a.localeCompare(b, 'zh-Hant')).forEach(districtName => {
        const option = document.createElement('option');
        option.value = districtName;
        option.textContent = districtName;
        districtSelector.appendChild(option);
    });
}

function clearUI() {
    if (geoJsonLayer) map.removeLayer(geoJsonLayer);
    districtSelector.innerHTML = '<option value="all">所有選區</option>';
    resetInfoPanel();
}

function setLoadingState(isLoading) {
    if (isLoading) {
        infoPanel.innerHTML = `<div class="p-4"><h2 class="text-2xl font-bold text-gray-800 animate-pulse">資料載入中...</h2><p class="text-gray-500">正在處理選舉與地理圖資，請稍候。</p></div>`;
    } else {
        resetInfoPanel();
    }
}

function getColor(percentage) {
    if (percentage < 0.05) return '#ef4444'; // 激烈
    if (percentage < 0.15) return '#a78bfa'; // 競爭
    return '#2563eb'; // 穩定
}

/**
 * @description **核心改動**: 顯示村里資料，並計算催票率
 * @param {Object} village - 單一村里的詳細資料物件
 */
function updateInfoPanel(village) {
    // **核心改動**: 計算催票率
    const winnerTurnout = village.electorate > 0 ? (village.winner_votes / village.electorate * 100).toFixed(2) : 0;
    const opponentTurnout = village.electorate > 0 ? (village.opponent_votes / village.electorate * 100).toFixed(2) : 0;

    infoPanel.innerHTML = `
        <div class="p-4">
            <h2 class="text-2xl font-bold text-gray-800 mb-1">${village.fullName}</h2>
            <p class="text-sm text-gray-500 mb-4">所屬選區: ${village.districtName}</p>
            <div class="mb-4">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-semibold text-blue-600">當選者: ${village.winner}</span>
                    <span class="text-lg font-bold text-blue-600">${village.winner_votes.toLocaleString()} 票</span>
                </div>
                <div class="flex justify-between items-center text-sm text-gray-600">
                    <span>催票率</span>
                    <span>${winnerTurnout}%</span>
                </div>
            </div>
            <div class="mb-4">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-semibold text-green-600">主要對手: ${village.opponent}</span>
                    <span class="text-lg font-bold text-green-600">${village.opponent_votes.toLocaleString()} 票</span>
                </div>
                <div class="flex justify-between items-center text-sm text-gray-600">
                    <span>催票率</span>
                    <span>${opponentTurnout}%</span>
                </div>
            </div>
            <div class="mt-4 h-64"><canvas id="vote-chart"></canvas></div>
        </div>
    `;

    const ctx = document.getElementById('vote-chart').getContext('2d');
    if (voteChart) voteChart.destroy();
    
    voteChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: village.candidates.map(c => c.name),
            datasets: [{
                label: '得票數', 
                data: village.candidates.map(c => c.votes),
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderColor: 'rgba(37, 99, 235, 1)',
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
    infoPanel.innerHTML = `<div class="p-4"><h2 class="text-2xl font-bold text-gray-800">請選擇一個村里</h2><p class="text-gray-500">點擊地圖上的區塊來查看該村里的詳細選舉數據。</p></div>`;
}
