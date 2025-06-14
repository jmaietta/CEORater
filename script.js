document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    // This is the URL of your backend.
    const BACKEND_URL = 'https://ceorater-backend.onrender.com';

    // --- DOM ELEMENTS ---
    const tableBody = document.getElementById('ceoTableBody');
    const filterTabs = document.getElementById('filterTabs');
    const popup = document.getElementById('mediaPopup');
    const closePopupBtn = document.getElementById('closePopup');
    const popupOverlay = document.getElementById('popupOverlay');
    const popupCeoName = document.getElementById('popupCeoName');
    const popupMediaContent = document.getElementById('popupMediaContent');
    
    // --- APP STATE ---
    // We'll store the data globally once it's fetched.
    let ceoData = [];
    let mediaLinks = {};

    // --- FUNCTIONS ---

    /**
     * Fetches all data from the backend server.
     */
    async function fetchData() {
        // Show a loading message while fetching
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center p-8 text-gray-500">Loading live data...</td></tr>`;
        try {
            const response = await fetch(`${BACKEND_URL}/api/ceo-data`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            ceoData = data.ceoData;
            mediaLinks = data.mediaLinks;
            // Render the table with the default 'all' filter after data is fetched
            renderTable('all'); 
        } catch (error) {
            console.error("Could not fetch data from backend:", error);
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center p-8 text-red-500">Could not load data. Please check the backend connection and URL.</td></tr>`;
        }
    }

    /**
     * Generates the HTML for the insider score progress bar.
     * @param {number} score - The insider score from 0-100.
     * @returns {string} The HTML string for the score bar.
     */
    function getInsiderScoreBar(score) {
        let colorClass = 'bg-green-500';
        if (score < 70) colorClass = 'bg-yellow-500';
        if (score < 40) colorClass = 'bg-red-500';
        return `
            <div class="w-24 bg-gray-200 rounded-full h-2.5">
                <div class="${colorClass} h-2.5 rounded-full" style="width: ${score}%"></div>
            </div>
        `;
    }
    
    /**
     * Renders the main table based on the selected filter.
     * @param {string} [filter='all'] - The filter to apply (e.g., 'all', 'top', 'flags').
     */
    function renderTable(filter = 'all') {
        if (ceoData.length === 0) {
            // This case is handled by the initial loading message in fetchData
            return;
        }

        tableBody.innerHTML = ''; // Clear existing table rows
        const filteredData = ceoData.filter(ceo => ceo.filter.includes(filter));

        if (filteredData.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center p-8 text-gray-500">No CEOs match the selected filter.</td></tr>`;
            return;
        }

        filteredData.forEach(ceo => {
            const row = document.createElement('tr');
            if (ceo.rank <= 3 && filter === 'all') {
                row.classList.add('top-3-highlight');
            }
            
            const isPositiveReturn = !ceo.returns.startsWith('-');
            
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-lg font-bold ${ceo.rank <= 3 && filter === 'all' ? 'text-purple-600' : 'text-gray-700'}">${ceo.rank}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-semibold text-gray-900">${ceo.ceo}</div>
                    <div class="text-sm text-gray-500">${ceo.company}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${ceo.tenure}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold ${isPositiveReturn ? 'return-positive' : 'return-negative'}">${ceo.returns}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${parseFloat(ceo.ownership) > 1 ? 'high-ownership' : 'text-gray-600'}">${ceo.ownership}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${getInsiderScoreBar(ceo.insiderScore)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                        ${ceo.media.map(m => `
                            <div class="flex items-center text-xs text-gray-500">
                                <i class="fa-brands ${m.type === 'youtube' ? 'fa-youtube text-red-600' : 'fa-podcast text-purple-600'} mr-1"></i>
                                ${m.count}
                            </div>
                        `).join('')}
                         ${ceo.media.length > 0 ? `<button data-ceo="${ceo.ceo}" class="view-media-btn text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-1 px-2 rounded-md">View</button>` : `<span class="text-xs text-gray-400">None</span>`}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-lg font-bold text-gray-800">${ceo.totalScore}</td>
            `;
            tableBody.appendChild(row);
        });
        
        // Add event listeners to the newly created "View" buttons
        document.querySelectorAll('.view-media-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const ceoName = e.target.dataset.ceo;
                openPopup(ceoName);
            });
        });
    }

    /**
     * Opens the media popup with content for the specified CEO.
     * @param {string} ceoName - The name of the CEO to show media for.
     */
    function openPopup(ceoName) {
        const media = mediaLinks[ceoName] || [];
        popupCeoName.textContent = `${ceoName}'s Media`;
        popupMediaContent.innerHTML = '';

        if (media.length > 0) {
             media.forEach(item => {
                const linkEl = document.createElement('a');
                linkEl.href = item.url;
                linkEl.target = '_blank';
                linkEl.rel = 'noopener noreferrer';
                linkEl.className = 'block p-4 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors';
                linkEl.innerHTML = `
                    <div class="flex items-center">
                       <i class="fa-brands ${item.type === 'youtube' ? 'fa-youtube text-red-600' : 'fa-podcast text-purple-600'} mr-3 fa-lg w-6 text-center"></i>
                       <span class="font-semibold">${item.title}</span>
                    </div>
                `;
                popupMediaContent.appendChild(linkEl);
            });
        } else {
            popupMediaContent.innerHTML = '<p class="text-gray-500">No recent media found.</p>';
        }

        popup.classList.remove('translate-x-full');
        popupOverlay.classList.remove('hidden');
    }

    /**
     * Closes the media popup.
     */
    function closePopup() {
        popup.classList.add('translate-x-full');
        popupOverlay.classList.add('hidden');
    }

    // --- EVENT LISTENERS ---

    // Handles clicks on the filter tabs
    filterTabs.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            // Update active tab style
            document.querySelector('#filterTabs button.text-purple-600').classList.remove('text-purple-600', 'border-purple-600');
            e.target.classList.add('text-purple-600', 'border-purple-600');
            
            // Re-render the table with the new filter
            renderTable(e.target.dataset.filter);
        }
    });

    // Handles closing the popup
    closePopupBtn.addEventListener('click', closePopup);
    popupOverlay.addEventListener('click', closePopup);
    
    // --- INITIALIZATION ---
    fetchData(); // Fetch data from the backend as soon as the page loads
});
