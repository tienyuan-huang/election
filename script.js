let electionData = [];

// 初始化地圖
const map = L.map('map').setView([23.9738, 120.982], 7.5); // 台灣中心點

// 加入 CartoDB Positron 圖層 (樸素風格)
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

const infoPanel = document.getElementById('info-panel');
const districtList = document.getElementById('district-list');
let voteChart = null; // 用於存放 Chart.js 實例

// 根據差距百分比決定顏色
function getColor(percentage) {
    if (percentage < 0.05) return '#ef4444'; // 紅色 (激烈)
    if (percentage < 0.15) return '#a78bfa'; // 淺紫色 (競爭)
    return '#2563eb'; // 深藍色 (穩定)
}

// 更新右側資訊面板
function updateInfoPanel(data) {
    const winnerPercentage = (data.winner_votes / data.total_votes * 100).toFixed(2);
    const opponentPercentage = (data.opponent_votes / data.total_votes * 100).toFixed(2);

    infoPanel.innerHTML = `
        <h2 class="text-2xl font-bold text-gray-800 mb-1">${data.district}</h2>
        <p class="text-sm text-gray-500 mb-4">對應行政區：${data.areas}</p>
        
        <div class="mb-4">
            <div class="flex justify-between items-center mb-1">
                <span class="font-semibold text-blue-600">當選者: ${data.winner}</span>
                <span class="text-lg font-bold text-blue-600">${data.winner_votes.toLocaleString()} 票</span>
            </div>
             <div class="flex justify-between items-center text-sm text-gray-600">
                <span>催票率</span>
                <span>${winnerPercentage}%</span>
            </div>
        </div>

        <div class="mb-4">
            <div class="flex justify-between items-center mb-1">
                <span class="font-semibold text-green-600">主要對手</span>
                 <span class="text-lg font-bold text-green-600">${data.opponent_votes.toLocaleString()} 票</span>
            </div>
             <div class="flex justify-between items-center text-sm text-gray-600">
                <span>催票率</span>
                <span>${opponentPercentage}%</span>
            </div>
        </div>

        <div class="mt-4 h-48">
            <canvas id="vote-chart"></canvas>
        </div>
    `;

    // 繪製或更新圖表
    const ctx = document.getElementById('vote-chart').getContext('2d');
    if (voteChart) {
        voteChart.destroy();
    }
    voteChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [data.winner, '主要對手'],
            datasets: [{
                label: '得票數',
                data: [data.winner_votes, data.opponent_votes],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',  // Blue for winner
                    'rgba(34, 197, 94, 0.7)'    // Green for opponent
                ],
                borderColor: [
                    'rgba(37, 99, 235, 1)',     // Blue for winner
                    'rgba(22, 163, 74, 1)'      // Green for opponent
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// 處理點擊事件
function onDistrictSelect(data) {
    updateInfoPanel(data);
    map.setView(data.coords, 10); // 將地圖視圖移至選定選區
}

document.addEventListener('DOMContentLoaded', function() {
    Papa.parse('election_data.csv', {
        download: true,
        header: true,
        dynamicTyping: true,
        complete: function(results) {
            electionData = results.data.map(d => {
                d.coords = [d.lat, d.lng];
                return d;
            });
            initialize();
        }
    });
});

function initialize() {
    // 遍歷資料，生成地圖標記和列表項目
    electionData.forEach(data => {
        // 計算差距
        const margin = data.winner_votes - data.opponent_votes;
        const totalValidVotes = data.winner_votes + data.opponent_votes;
        const marginPercentage = margin / totalValidVotes;
        const color = getColor(marginPercentage);
        const animationClass = color === '#ef4444' ? 'animate-pulse' : '';

        // 創建自定義圖標
        const icon = L.divIcon({
            className: 'leaflet-div-icon',
            html: `<div style="background-color:${color};" class="w-5 h-5 rounded-full border-2 border-white shadow-md ${animationClass}"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        // 在地圖上添加標記
        const marker = L.marker(data.coords, { icon: icon }).addTo(map);
        marker.bindTooltip(`${data.district}<br>當選者: ${data.winner}`, {
            permanent: false, 
            direction: 'top',
            offset: [0, -10]
        });
        marker.on('click', () => onDistrictSelect(data));

        // 生成右側列表項目
        const listItem = document.createElement('div');
        listItem.className = 'p-4 border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors duration-200';
        listItem.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="font-semibold">${data.district}</h3>
                    <p class="text-sm text-gray-600">當選者: ${data.winner}</p>
                </div>
                <div class="w-4 h-4 rounded-full" style="background-color: ${color};"></div>
            </div>
        `;
        listItem.addEventListener('click', () => onDistrictSelect(data));
        districtList.appendChild(listItem);
    });
}