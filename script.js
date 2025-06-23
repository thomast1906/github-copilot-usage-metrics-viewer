class CopilotUsageAnalyzer {
    constructor() {
        this.rawData = [];
        this.filteredData = [];
        this.charts = {};
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('csvFileInput').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('loadSampleData').addEventListener('click', () => this.loadSampleData());
        document.getElementById('dateRange').addEventListener('change', () => this.applyFilters());
        document.getElementById('userFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('modelFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('searchInput').addEventListener('input', () => this.filterTable());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportFilteredData());
        
        // Modal event listeners
        this.setupModalEventListeners();
        
        // Stat card click listeners
        this.setupStatCardListeners();
    }

    async loadSampleData() {
        try {
            const response = await fetch('./data_example.csv');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const csvText = await response.text();
            this.parseCSV(csvText);
        } catch (error) {
            console.error('Error loading sample data:', error);
            // Try without the ./ prefix
            try {
                const response = await fetch('data_example.csv');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const csvText = await response.text();
                this.parseCSV(csvText);
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                alert('Error loading sample data. Please upload your own CSV file.');
            }
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.parseCSV(e.target.result);
        };
        reader.readAsText(file);
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = this.parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
        
        this.rawData = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]).map(v => v.trim().replace(/^"|"$/g, ''));
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index];
                });
                
                // Parse the data with correct field mapping
                const timestamp = new Date(row.Timestamp);
                if (!isNaN(timestamp.getTime()) && row.User && row.Model) {
                    this.rawData.push({
                        timestamp: timestamp,
                        user: row.User,
                        model: row.Model,
                        requests: parseInt(row['Requests Used']) || 1,
                        exceedsQuota: row['Exceeds Monthly Quota'] === 'TRUE' || row['Exceeds Monthly Quota'] === 'True',
                        quota: row['Total Monthly Quota'] || 'Unlimited',
                        // Keep original data for export
                        originalData: row
                    });
                }
            }
        }
        
        if (this.rawData.length === 0) {
            alert('No valid data found in the CSV file. Please check the format.');
            return;
        }
        
        this.processData();
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }

    processData() {
        if (this.rawData.length === 0) return;
        
        // Sort data by timestamp
        this.rawData.sort((a, b) => a.timestamp - b.timestamp);
        
        // Initialize filters
        this.populateFilters();
        
        // Apply initial filters
        this.applyFilters();
        
        // Show dashboard
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
    }

    populateFilters() {
        const users = [...new Set(this.rawData.map(row => row.user))].sort();
        const models = [...new Set(this.rawData.map(row => row.model))].sort();
        
        const userFilter = document.getElementById('userFilter');
        const modelFilter = document.getElementById('modelFilter');
        
        // Clear existing options (except "All")
        userFilter.innerHTML = '<option value="all">All Users</option>';
        modelFilter.innerHTML = '<option value="all">All Models</option>';
        
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user;
            option.textContent = user;
            userFilter.appendChild(option);
        });
        
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelFilter.appendChild(option);
        });
    }

    applyFilters() {
        const dateRange = document.getElementById('dateRange').value;
        const userFilter = document.getElementById('userFilter').value;
        const modelFilter = document.getElementById('modelFilter').value;
        
        let filtered = [...this.rawData];
        
        // Date filter
        if (dateRange !== 'all') {
            const days = parseInt(dateRange);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            filtered = filtered.filter(row => row.timestamp >= cutoffDate);
        }
        
        // User filter
        if (userFilter !== 'all') {
            filtered = filtered.filter(row => row.user === userFilter);
        }
        
        // Model filter
        if (modelFilter !== 'all') {
            filtered = filtered.filter(row => row.model === modelFilter);
        }
        
        this.filteredData = filtered;
        this.updateDashboard();
    }

    updateDashboard() {
        this.updateStatCards();
        this.updateCharts();
        this.updateTable();
    }

    updateStatCards() {
        const data = this.filteredData;
        
        const totalUsers = new Set(data.map(row => row.user)).size;
        const totalRequests = data.reduce((sum, row) => sum + row.requests, 0);
        const totalModels = new Set(data.map(row => row.model)).size;
        const avgRequestsPerUser = totalUsers > 0 ? Math.round(totalRequests / totalUsers) : 0;
        
        // Calculate daily average (average requests per unique day)
        const uniqueDays = new Set(data.map(row => row.timestamp.toDateString())).size;
        const dailyAverage = uniqueDays > 0 ? Math.round(totalRequests / uniqueDays) : 0;
        
        document.getElementById('totalUsers').textContent = totalUsers.toLocaleString();
        document.getElementById('totalRequests').textContent = totalRequests.toLocaleString();
        document.getElementById('totalModels').textContent = totalModels.toLocaleString();
        document.getElementById('avgRequestsPerUser').textContent = avgRequestsPerUser.toLocaleString();
        document.getElementById('dailyAverage').textContent = dailyAverage.toLocaleString();
    }

    updateCharts() {
        this.createTimelineChart();
        this.createModelChart();
        this.createModelBarChart();
        this.createUserChart();
        this.createModelTrendsChart();
        this.createDayOfWeekChart();
    }

    createTimelineChart() {
        const ctx = document.getElementById('timelineChart').getContext('2d');
        
        // Destroy existing chart
        if (this.charts.timeline) {
            this.charts.timeline.destroy();
        }
        
        // Group data by date
        const dailyData = {};
        this.filteredData.forEach(row => {
            const date = row.timestamp.toISOString().split('T')[0];
            dailyData[date] = (dailyData[date] || 0) + row.requests;
        });
        
        const sortedDates = Object.keys(dailyData).sort();
        const values = sortedDates.map(date => dailyData[date]);
        
        this.charts.timeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates.map(date => new Date(date).toLocaleDateString()),
                datasets: [{
                    label: 'Requests',
                    data: values,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    createModelChart() {
        const ctx = document.getElementById('modelChart').getContext('2d');
        
        if (this.charts.model) {
            this.charts.model.destroy();
        }
        
        const modelData = {};
        this.filteredData.forEach(row => {
            modelData[row.model] = (modelData[row.model] || 0) + row.requests;
        });
        
        const labels = Object.keys(modelData);
        const values = Object.values(modelData);
        const colors = this.generateColors(labels.length);
        
        this.charts.model = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const model = labels[index];
                        this.showModelUserBreakdown(model);
                    }
                }
            }
        });
    }

    createModelBarChart() {
        const ctx = document.getElementById('modelBarChart').getContext('2d');
        
        if (this.charts.modelBar) {
            this.charts.modelBar.destroy();
        }
        
        const modelData = {};
        this.filteredData.forEach(row => {
            modelData[row.model] = (modelData[row.model] || 0) + row.requests;
        });
        
        const sortedModels = Object.entries(modelData)
            .sort(([,a], [,b]) => b - a);
        
        const labels = sortedModels.map(([model]) => model.length > 20 ? model.substring(0, 20) + '...' : model);
        const values = sortedModels.map(([,requests]) => requests);
        const colors = this.generateColors(labels.length);
        
        this.charts.modelBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Requests',
                    data: values,
                    backgroundColor: colors,
                    borderColor: colors.map(color => color.replace('0.8', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                // Show full model name in tooltip
                                const index = context[0].dataIndex;
                                return sortedModels[index][0];
                            }
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const model = sortedModels[index][0];
                        this.showModelUserBreakdown(model);
                    }
                }
            }
        });
    }

    createUserChart() {
        const ctx = document.getElementById('userChart').getContext('2d');
        
        if (this.charts.user) {
            this.charts.user.destroy();
        }
        
        const userData = {};
        this.filteredData.forEach(row => {
            userData[row.user] = (userData[row.user] || 0) + row.requests;
        });
        
        const sortedUsers = Object.entries(userData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
        
        const labels = sortedUsers.map(([user]) => user);
        const values = sortedUsers.map(([,requests]) => requests);
        
        this.charts.user = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Requests',
                    data: values,
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: '#667eea',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
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

    createModelTrendsChart() {
        const ctx = document.getElementById('modelTrendsChart').getContext('2d');
        
        if (this.charts.modelTrends) {
            this.charts.modelTrends.destroy();
        }
        
        // Get last 30 days of data
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Generate all dates for the last 30 days
        const dateRange = [];
        for (let d = new Date(thirtyDaysAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
            dateRange.push(new Date(d).toISOString().split('T')[0]);
        }
        
        // Get unique models
        const models = [...new Set(this.filteredData.map(row => row.model))];
        
        // Initialize data structure
        const modelTrendData = {};
        models.forEach(model => {
            modelTrendData[model] = {};
            dateRange.forEach(date => {
                modelTrendData[model][date] = 0;
            });
        });
        
        // Aggregate data by date and model
        this.filteredData.forEach(row => {
            const date = row.timestamp.toISOString().split('T')[0];
            if (modelTrendData[row.model] && modelTrendData[row.model].hasOwnProperty(date)) {
                modelTrendData[row.model][date] += row.requests;
            }
        });
        
        // Create datasets for each model
        const datasets = models.map((model, index) => {
            const color = this.generateColors(models.length)[index];
            return {
                label: model.length > 25 ? model.substring(0, 25) + '...' : model,
                data: dateRange.map(date => modelTrendData[model][date]),
                borderColor: color,
                backgroundColor: color.replace('0.8)', '0.1)'),
                fill: false,
                tension: 0.4
            };
        });
        
        this.charts.modelTrends = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dateRange.map(date => new Date(date).toLocaleDateString()),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    createDayOfWeekChart() {
        const ctx = document.getElementById('dayOfWeekChart').getContext('2d');
        
        if (this.charts.dayOfWeek) {
            this.charts.dayOfWeek.destroy();
        }
        
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayData = Array(7).fill(0);
        
        this.filteredData.forEach(row => {
            const day = row.timestamp.getDay();
            dayData[day] += row.requests;
        });
        
        this.charts.dayOfWeek = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: dayNames,
                datasets: [{
                    label: 'Requests',
                    data: dayData,
                    backgroundColor: 'rgba(102, 126, 234, 0.2)',
                    borderColor: '#667eea',
                    borderWidth: 2,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true
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

    generateColors(count) {
        const baseColors = [
            '#667eea', '#764ba2', '#f093fb', '#f5576c',
            '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
            '#ffecd2', '#fcb69f', '#a8edea', '#fed6e3'
        ];
        
        const result = [];
        for (let i = 0; i < count; i++) {
            const baseColor = baseColors[i % baseColors.length];
            // Convert hex to rgba with 0.8 opacity
            const rgba = this.hexToRgba(baseColor, 0.8);
            result.push(rgba);
        }
        return result;
    }

    hexToRgba(hex, alpha = 1) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    updateTable() {
        const tbody = document.getElementById('dataTableBody');
        tbody.innerHTML = '';
        
        // Show first 100 rows for performance
        const displayData = this.filteredData.slice(0, 100);
        
        displayData.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.timestamp.toLocaleString()}</td>
                <td>${row.user}</td>
                <td>${row.model}</td>
                <td>${row.requests}</td>
                <td class="${row.exceedsQuota ? 'quota-exceeded' : 'quota-normal'}">
                    ${row.exceedsQuota ? 'TRUE' : 'FALSE'}
                </td>
                <td>${row.quota}</td>
            `;
            tbody.appendChild(tr);
        });
        
        if (this.filteredData.length > 100) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="6" style="text-align: center; font-style: italic; color: #666;">
                    Showing first 100 rows of ${this.filteredData.length.toLocaleString()} total rows
                </td>
            `;
            tbody.appendChild(tr);
        }
    }

    filterTable() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const rows = document.querySelectorAll('#dataTableBody tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    }

    setupModalEventListeners() {
        // Close modal when clicking the X or outside the modal
        document.querySelectorAll('.modal').forEach(modal => {
            const closeBtn = modal.querySelector('.close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    modal.style.display = 'none';
                });
            }
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    setupStatCardListeners() {
        // Models stat card click listener
        const modelsStatCard = document.querySelector('[data-modal="models-modal"]');
        if (modelsStatCard) {
            modelsStatCard.addEventListener('click', () => this.showModelsModal());
        }

        // Users stat card click listener
        const usersStatCard = document.querySelector('[data-modal="users-modal"]');
        if (usersStatCard) {
            usersStatCard.addEventListener('click', () => this.showUsersModal());
        }
    }

    showModelsModal() {
        const modal = document.getElementById('models-modal');
        const tbody = document.getElementById('modelsDetailTableBody');
        
        // Calculate model statistics
        const modelData = {};
        this.filteredData.forEach(row => {
            modelData[row.model] = (modelData[row.model] || 0) + row.requests;
        });
        
        const totalRequests = Object.values(modelData).reduce((sum, count) => sum + count, 0);
        const sortedModels = Object.keys(modelData).sort((a, b) => modelData[b] - modelData[a]);
        
        tbody.innerHTML = '';
        sortedModels.forEach(model => {
            const count = modelData[model];
            const percentage = totalRequests > 0 ? ((count / totalRequests) * 100).toFixed(1) : 0;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${model}</td>
                <td>${count.toLocaleString()}</td>
                <td>${percentage}%</td>
            `;
            tbody.appendChild(tr);
        });
        
        modal.style.display = 'block';
    }

    showUsersModal() {
        const modal = document.getElementById('users-modal');
        const tbody = document.getElementById('usersDetailTableBody');
        
        // Calculate user statistics
        const userData = {};
        this.filteredData.forEach(row => {
            userData[row.user] = (userData[row.user] || 0) + row.requests;
        });
        
        const totalRequests = Object.values(userData).reduce((sum, count) => sum + count, 0);
        const sortedUsers = Object.keys(userData).sort((a, b) => userData[b] - userData[a]);
        
        tbody.innerHTML = '';
        sortedUsers.forEach(user => {
            const count = userData[user];
            const percentage = totalRequests > 0 ? ((count / totalRequests) * 100).toFixed(1) : 0;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user}</td>
                <td>${count.toLocaleString()}</td>
                <td>${percentage}%</td>
            `;
            tbody.appendChild(tr);
        });
        
        modal.style.display = 'block';
    }

    showModelUserBreakdown(model) {
        const modal = document.getElementById('model-distribution-modal');
        const detailsDiv = document.getElementById('modelDistributionDetails');
        
        // Filter data for the selected model
        const modelData = this.filteredData.filter(row => row.model === model);
        
        // Group by user
        const userData = {};
        modelData.forEach(row => {
            userData[row.user] = (userData[row.user] || 0) + row.requests;
        });
        
        const sortedUsers = Object.keys(userData).sort((a, b) => userData[b] - userData[a]);
        const totalRequests = Object.values(userData).reduce((sum, count) => sum + count, 0);
        
        let html = `<h4>Users for Model: ${model}</h4>`;
        html += `<p>Total Requests: ${totalRequests.toLocaleString()}</p>`;
        html += '<table style="width: 100%; margin-top: 20px;" class="detail-table">';
        html += '<thead><tr><th>User</th><th>Requests</th><th>Percentage</th></tr></thead>';
        html += '<tbody>';
        
        sortedUsers.forEach(user => {
            const count = userData[user];
            const percentage = totalRequests > 0 ? ((count / totalRequests) * 100).toFixed(1) : 0;
            html += `<tr><td>${user}</td><td>${count.toLocaleString()}</td><td>${percentage}%</td></tr>`;
        });
        
        html += '</tbody></table>';
        detailsDiv.innerHTML = html;
        modal.style.display = 'block';
    }

    exportFilteredData() {
        if (this.filteredData.length === 0) {
            alert('No data to export');
            return;
        }
        
        const headers = ['Timestamp', 'User', 'Model', 'Requests Used', 'Exceeds Monthly Quota', 'Total Monthly Quota'];
        const csvContent = [
            headers.join(','),
            ...this.filteredData.map(row => [
                row.originalData.Timestamp,
                row.originalData.User,
                row.originalData.Model,
                row.originalData['Requests Used'],
                row.originalData['Exceeds Monthly Quota'],
                row.originalData['Total Monthly Quota']
            ].join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `copilot-metrics-filtered-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CopilotUsageAnalyzer();
});

function populateFilters() {
    // Populate user filter
    const users = [...new Set(allData.map(row => row.user))].sort();
    userFilter.innerHTML = '<option value="all">All Users</option>';
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user;
        option.textContent = user;
        userFilter.appendChild(option);
    });
    
    // Populate model filter
    const models = [...new Set(allData.map(row => row.model))].sort();
    modelFilter.innerHTML = '<option value="all">All Models</option>';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelFilter.appendChild(option);
    });
}

function applyFilters() {
    let data = [...allData];
    
    // Date range filter
    const dateRange = dateRangeFilter.value;
    if (dateRange !== 'all') {
        const days = parseInt(dateRange);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        data = data.filter(row => row.timestamp >= cutoffDate);
    }
    
    // User filter
    const selectedUser = userFilter.value;
    if (selectedUser !== 'all') {
        data = data.filter(row => row.user === selectedUser);
    }
    
    // Model filter
    const selectedModel = modelFilter.value;
    if (selectedModel !== 'all') {
        data = data.filter(row => row.model === selectedModel);
    }
    
    // Search filter
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
        data = data.filter(row => 
            row.user.toLowerCase().includes(searchTerm) ||
            row.model.toLowerCase().includes(searchTerm) ||
            row.timestamp.toLocaleDateString().includes(searchTerm)
        );
    }
    
    filteredData = data;
    updateDashboard();
}

function updateDashboard() {
    updateStatCards();
    updateCharts();
    updateDataTable();
}

function updateStatCards() {
    const totalUsers = new Set(filteredData.map(row => row.user)).size;
    const totalRequests = filteredData.reduce((sum, row) => sum + row.requests, 0);
    const totalModels = new Set(filteredData.map(row => row.model)).size;
    const avgRequestsPerUser = totalUsers > 0 ? Math.round(totalRequests / totalUsers) : 0;
    
    // Most popular model (by total requests)
    const modelRequestCounts = {};
    filteredData.forEach(row => {
        modelRequestCounts[row.model] = (modelRequestCounts[row.model] || 0) + row.requests;
    });
    
    const mostPopularModel = Object.keys(modelRequestCounts).reduce((a, b) => 
        modelRequestCounts[a] > modelRequestCounts[b] ? a : b, 
        Object.keys(modelRequestCounts)[0] || '-'
    );
    
    // Daily average (average requests per unique day)
    const uniqueDays = new Set(filteredData.map(row => row.timestamp.toDateString())).size;
    const dailyAverage = uniqueDays > 0 ? Math.round(totalRequests / uniqueDays) : 0;
    
    document.getElementById('totalUsers').textContent = totalUsers.toLocaleString();
    document.getElementById('totalRequests').textContent = totalRequests.toLocaleString();
    document.getElementById('totalModels').textContent = totalModels.toLocaleString();
    document.getElementById('avgRequestsPerUser').textContent = avgRequestsPerUser.toLocaleString();
    document.getElementById('mostPopularModel').textContent = mostPopularModel;
    document.getElementById('dailyAverage').textContent = dailyAverage.toLocaleString();
}

function updateCharts() {
    updateTimelineChart();
    updateModelChart();
    updateModelBarChart();
    updateUserChart();
    updateModelTrendsChart();
    updateDayOfWeekChart();
}

function updateTimelineChart() {
    const ctx = document.getElementById('timelineChart').getContext('2d');
    
    // Group data by date
    const dailyData = {};
    filteredData.forEach(row => {
        const date = row.timestamp.toDateString();
        dailyData[date] = (dailyData[date] || 0) + row.requests;
    });
    
    const sortedDates = Object.keys(dailyData).sort((a, b) => new Date(a) - new Date(b));
    
    if (charts.timeline) {
        charts.timeline.destroy();
    }
    
    charts.timeline = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates.map(date => new Date(date).toLocaleDateString()),
            datasets: [{
                label: 'Requests',
                data: sortedDates.map(date => dailyData[date]),
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateModelChart() {
    const ctx = document.getElementById('modelChart').getContext('2d');
    
    // Group data by model
    const modelData = {};
    filteredData.forEach(row => {
        modelData[row.model] = (modelData[row.model] || 0) + row.requests;
    });
    
    const models = Object.keys(modelData);
    const colors = generateColors(models.length);
    
    if (charts.model) {
        charts.model.destroy();
    }
    
    charts.model = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: models,
            datasets: [{
                data: models.map(model => modelData[model]),
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const model = models[index];
                    showModelUserBreakdown(model);
                }
            }
        }
    });
}

function updateModelBarChart() {
    const ctx = document.getElementById('modelBarChart').getContext('2d');
    
    // Group data by model
    const modelData = {};
    filteredData.forEach(row => {
        modelData[row.model] = (modelData[row.model] || 0) + row.requests;
    });
    
    const sortedModels = Object.keys(modelData).sort((a, b) => modelData[b] - modelData[a]);
    
    if (charts.modelBar) {
        charts.modelBar.destroy();
    }
    
    charts.modelBar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedModels,
            datasets: [{
                label: 'Requests',
                data: sortedModels.map(model => modelData[model]),
                backgroundColor: '#667eea',
                borderColor: '#5a67d8',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const model = sortedModels[index];
                    showModelUserBreakdown(model);
                }
            }
        }
    });
}

function updateUserChart() {
    const ctx = document.getElementById('userChart').getContext('2d');
    
    // Group data by user
    const userData = {};
    filteredData.forEach(row => {
        userData[row.user] = (userData[row.user] || 0) + row.requests;
    });
    
    const sortedUsers = Object.keys(userData).sort((a, b) => userData[b] - userData[a]).slice(0, 10);
    
    if (charts.user) {
        charts.user.destroy();
    }
    
    charts.user = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedUsers,
            datasets: [{
                label: 'Requests',
                data: sortedUsers.map(user => userData[user]),
                backgroundColor: '#764ba2',
                borderColor: '#6b46c1',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateModelTrendsChart() {
    const ctx = document.getElementById('modelTrendsChart').getContext('2d');
    
    // Get last 30 days of data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentData = filteredData.filter(row => row.timestamp >= thirtyDaysAgo);
    
    // Group by date and model
    const trendData = {};
    const models = [...new Set(recentData.map(row => row.model))];
    
    recentData.forEach(row => {
        const date = row.timestamp.toDateString();
        if (!trendData[date]) {
            trendData[date] = {};
        }
        trendData[date][row.model] = (trendData[date][row.model] || 0) + row.requests;
    });
    
    const sortedDates = Object.keys(trendData).sort((a, b) => new Date(a) - new Date(b));
    const colors = generateColors(models.length);
    
    if (charts.modelTrends) {
        charts.modelTrends.destroy();
    }
    
    const datasets = models.map((model, index) => ({
        label: model,
        data: sortedDates.map(date => trendData[date][model] || 0),
        borderColor: colors[index],
        backgroundColor: colors[index] + '20',
        tension: 0.4,
        fill: false
    }));
    
    charts.modelTrends = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates.map(date => new Date(date).toLocaleDateString()),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateDayOfWeekChart() {
    const ctx = document.getElementById('dayOfWeekChart').getContext('2d');
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayData = new Array(7).fill(0);
    
    filteredData.forEach(row => {
        const dayOfWeek = row.timestamp.getDay();
        dayData[dayOfWeek] += row.requests;
    });
    
    if (charts.dayOfWeek) {
        charts.dayOfWeek.destroy();
    }
    
    charts.dayOfWeek = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: dayNames,
            datasets: [{
                label: 'Requests',
                data: dayData,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.2)',
                pointBackgroundColor: '#667eea',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#667eea'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function updateDataTable() {
    const tbody = document.getElementById('dataTableBody');
    tbody.innerHTML = '';
    
    filteredData.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.timestamp.toLocaleString()}</td>
            <td>${row.user}</td>
            <td>${row.model}</td>
            <td>${row.requests.toLocaleString()}</td>
            <td>${row.exceeds_quota ? 'Yes' : 'No'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function generateColors(count) {
    const colors = [
        '#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe',
        '#43e97b', '#38f9d7', '#ffecd2', '#fcb69f', '#a8edea', '#fed6e3',
        '#ffeaa7', '#fab1a0', '#e17055', '#fdcb6e', '#6c5ce7', '#a29bfe'
    ];
    
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
    }
    return result;
}

function setupModalEventListeners() {
    // Close modal when clicking the X or outside the modal
    document.querySelectorAll('.modal').forEach(modal => {
        const closeBtn = modal.querySelector('.close');
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}

function setupStatCardListeners() {
    // Models stat card click listener
    const modelsStatCard = document.querySelector('[data-modal="models-modal"]');
    if (modelsStatCard) {
        modelsStatCard.addEventListener('click', showModelsModal);
    }
}

function showModelsModal() {
    const modal = document.getElementById('models-modal');
    const tbody = document.getElementById('modelsDetailTableBody');
    
    // Calculate model statistics
    const modelData = {};
    filteredData.forEach(row => {
        modelData[row.model] = (modelData[row.model] || 0) + row.requests;
    });
    
    const totalRequests = Object.values(modelData).reduce((sum, count) => sum + count, 0);
    const sortedModels = Object.keys(modelData).sort((a, b) => modelData[b] - modelData[a]);
    
    tbody.innerHTML = '';
    sortedModels.forEach(model => {
        const requests = modelData[model];
        const percentage = totalRequests > 0 ? ((requests / totalRequests) * 100).toFixed(1) : 0;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${model}</td>
            <td>${requests.toLocaleString()}</td>
            <td>${percentage}%</td>
        `;
        tbody.appendChild(tr);
    });
    
    modal.style.display = 'block';
}

function showModelUserBreakdown(model) {
    const modal = document.getElementById('model-distribution-modal');
    const detailsDiv = document.getElementById('modelDistributionDetails');
    
    // Filter data for the selected model
    const modelData = filteredData.filter(row => row.model === model);
    
    // Group by user
    const userData = {};
    modelData.forEach(row => {
        userData[row.user] = (userData[row.user] || 0) + row.requests;
    });
    
    const sortedUsers = Object.keys(userData).sort((a, b) => userData[b] - userData[a]);
    const totalRequests = Object.values(userData).reduce((sum, count) => sum + count, 0);
    
    let html = `<h4>Users for Model: ${model}</h4>`;
    html += `<p>Total Requests: ${totalRequests.toLocaleString()}</p>`;
    html += '<table style="width: 100%; margin-top: 20px;">';
    html += '<thead><tr><th>User</th><th>Requests</th><th>Percentage</th></tr></thead>';
    html += '<tbody>';
    
    sortedUsers.forEach(user => {
        const requests = userData[user];
        const percentage = totalRequests > 0 ? ((requests / totalRequests) * 100).toFixed(1) : 0;
        html += `<tr><td>${user}</td><td>${requests.toLocaleString()}</td><td>${percentage}%</td></tr>`;
    });
    
    html += '</tbody></table>';
    detailsDiv.innerHTML = html;
    modal.style.display = 'block';
}

function exportFilteredData() {
    if (filteredData.length === 0) {
        alert('No data to export');
        return;
    }
    
    // Create CSV content
    const headers = ['Timestamp', 'User', 'Model', 'Requests', 'Exceeds Quota'];
    let csv = headers.join(',') + '\n';
    
    filteredData.forEach(row => {
        const line = [
            row.timestamp.toISOString(),
            row.user,
            row.model,
            row.requests,
            row.exceeds_quota
        ].join(',');
        csv += line + '\n';
    });
    
    // Download the file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'copilot_usage_filtered.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}
