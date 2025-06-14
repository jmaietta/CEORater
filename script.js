document.addEventListener('DOMContentLoaded', () => {

    // --- DATA ---
    // In a real application, this data would be fetched from a backend API.
    const ceoData = [
        { rank: 1, ceo: 'Jensen Huang', company: 'NVIDIA', tenure: '31 yrs', returns: '+89,432%', ownership: '3.51%', insiderScore: 95, media: [{type: 'youtube', count: 8}, {type: 'podcast', count: 4}], totalScore: 98.2, filter: ['all', 'top', 'ownership', 'insider'] },
        { rank: 2, ceo: 'Mark Zuckerberg', company: 'Meta Platforms', tenure: '20.5 yrs', returns: '+1,247%', ownership: '13.60%', insiderScore: 88, media: [{type: 'youtube', count: 5}, {type: 'podcast', count: 3}], totalScore: 95.1, filter: ['all', 'top', 'ownership', 'insider'] },
        { rank: 3, ceo: 'Satya Nadella', company: 'Microsoft', tenure: '10.8 yrs', returns: '+1,120%', ownership: '0.04%', insiderScore: 92, media: [{type: 'youtube', count: 12}], totalScore: 91.5, filter: ['all', 'top', 'insider'] },
        { rank: 4, ceo: 'Tim Cook', company: 'Apple', tenure: '13.2 yrs', returns: '+980%', ownership: '0.02%', insiderScore: 78, media: [{type: 'podcast', count: 2}], totalScore: 85.7, filter: ['all', 'top'] },
        { rank: 25, ceo: 'Jane Doe', company: 'Tech Corp', tenure: '2.1 yrs', returns: '-15%', ownership: '0.01%', insiderScore: 25, media: [], totalScore: 35.2, filter: ['all', 'flags'] }
    ];
    
    // In a real application, these links would also come from your backend.
    const mediaLinks = {
        'Jensen Huang': [
            { type: 'youtube', title: 'NVIDIA GTC 2024 Keynote', url: 'https://www.youtube.com/watch?v=Y9p_c_f_I2Y' }, // Example URL
            { type: 'podcast', title: 'Acquired FM: The NVIDIA Story', url: 'https://www.acquired.fm/episodes/nvidia' }, // Example URL
            { type: 'youtube', title: 'Interview with CNBC', url: 'https://www.youtube.com/watch?v=s_w8_i_i_iI' } // Example URL
        ],
        'Mark Zuckerberg': [
            { type: 'podcast', title: 'Lex Fridman Podcast', url: 'https://www.youtube.com/watch?v=5zOHSysMmH0' }, // Example URL
            { type: 'youtube', title: 'Meta Connect 2023', url: 'https://www.youtube.com/watch?v=dz_c0_L-f4k' } // Example URL
        ],
        'Satya Nadella': [
            { type: 'youtube', title: 'Microsoft Ignite Opening', url: 'https://www.youtube.com/watch?v=9_g_m7p3b_Q' }, // Example URL
        ],
        'Tim Cook': [
             { type: 'podcast', title: 'The Vergecast', url: 'https://www.theverge.com/2022/9/9/23344609/tim-cook-apple-iphone-14-interview-vergecast' } // Example URL
        ],
         'Jane Doe': []
    };

    // --- DOM ELEMENTS ---
    const tableBody = document.getElementById('ceoTableBody');
    const filterTabs = document.getElementById('filterTabs');
    const popup = document.getElementById('mediaPopup');
    const closePopupBtn = document.getElementById('closePopup');
    const popupOverlay = document.getElementById('popupOverlay');
    const popupCeoName = document.getElementById('popupCeoName');
    const popupMediaContent = document.getElementById('popupMediaContent');

    // --- FUNCTIONS ---

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
        tableBody.innerHTML = ''; // Clear existing table rows
        const filteredData = ceoData.filter(ceo => ceo.filter.includes(filter));

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
    
    // --- INITIAL RENDER ---
    renderTable(); // Render the table for the first time on page load
});
