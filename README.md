# GitHub Copilot Usage Metrics Viewer

A modern, interactive web application for visualizing GitHub Copilot usage metrics. Built with vanilla JavaScript, Chart.js, and modern CSS, this tool provides comprehensive analytics for your Copilot usage data while keeping all data processing in the browser for privacy.

## Features

### 📊 Interactive Dashboard
- **Stat Cards**: Key metrics at a glance (total users, requests, models, averages)
- **Timeline Chart**: Requests over time with trend visualization
- **Model Distribution**: Pie chart showing usage by AI model
- **Top Users**: Bar chart of most active users
- **Hourly Patterns**: Usage patterns throughout the day

### 🔍 Advanced Filtering
- Date range filtering (7 days, 30 days, 90 days, all time)
- User-specific filtering
- Model-specific filtering
- Real-time search in data table

### 🔒 Privacy First
- All data processing happens in your browser
- No data is sent to external servers
- Upload your own CSV files securely
- Export filtered data as needed

### 📱 Responsive Design
- Modern, gradient-based UI
- Mobile-friendly responsive layout
- Smooth animations and transitions
- Professional stat cards and charts

## Setup Instructions

### 1. Repository Setup
1. Create a new GitHub repository
2. Upload all files to your repository
3. Ensure your CSV data file is named `data_example.csv` (or update the filename in `script.js`)

### 2. Enable GitHub Pages
1. Go to your repository Settings
2. Navigate to "Pages" in the left sidebar
3. Under "Source", select "GitHub Actions"
4. The workflow will automatically deploy your site

### 3. CSV Data Format
Your CSV file should have the following columns:
```csv
Timestamp,User,Model,Requests Used,Exceeds Monthly Quota,Total Monthly Quota
2025-06-18T10:43:41.8378480Z,User41,gpt-4o-2024-11-20,1,FALSE,Unlimited
```

Required columns:
- `Timestamp`: ISO 8601 formatted timestamp
- `User`: User identifier
- `Model`: AI model name
- `Requests Used`: Number of requests (integer)
- `Exceeds Monthly Quota`: TRUE/FALSE
- `Total Monthly Quota`: Quota limit information

## Usage

### Loading Data
1. **Upload File**: Click "Choose CSV File" to upload your own data
2. **Load Sample**: Click "Load Sample Data" to use the included dataset
3. The dashboard will automatically appear once data is loaded

### Exploring Data
- Use the filter dropdowns to focus on specific time periods, users, or models
- Hover over charts for detailed information
- Search the data table for specific entries
- Export filtered data using the export button

### Sharing
- Your deployed GitHub Pages URL will be: `https://[username].github.io/[repository-name]`
- Share this URL with team members
- Each user can upload their own data files for analysis

## Technical Details

### Built With
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Charts**: Chart.js for interactive visualizations
- **Styling**: Modern CSS with gradients and animations
- **Fonts**: Inter font family, Font Awesome icons
- **Deployment**: GitHub Actions for automated builds

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers supported
- No server-side dependencies

### Performance
- Client-side CSV parsing for fast data loading
- Efficient data filtering and aggregation
- Optimized chart rendering
- Table pagination for large datasets

## Customization

### Styling
- Edit `styles.css` to customize colors, fonts, and layout
- Gradient colors can be modified in the CSS variables
- Chart colors are defined in the `generateColors()` function

### Functionality
- Modify `script.js` to add new chart types or metrics
- Update filter options or add new filtering criteria
- Customize the CSV parsing logic for different data formats

### Sample Data
- Replace `data_example.csv` with your own sample dataset
- Update the filename reference in the `loadSampleData()` function

## Development

### Local Development
1. Clone the repository
2. **Important**: The site must be served via HTTP (not opened directly in browser) due to CORS restrictions for loading CSV files
3. Start a local HTTP server:
   ```bash
   # Using Python 3
   python3 -m http.server 8000
   
   # Using Python 2
   python -m SimpleHTTPServer 8000
   
   # Using Node.js
   npx http-server
   
   # Using PHP
   php -S localhost:8000
   ```
4. Open http://localhost:8000 in your browser

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Security & Privacy

- **No External Dependencies**: All processing happens client-side
- **No Data Transmission**: Your data never leaves your browser
- **Local Storage**: No data is persisted unless explicitly exported
- **HTTPS Deployment**: GitHub Pages provides secure HTTPS hosting

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

For issues, questions, or contributions:
1. Check the [Issues](../../issues) section
2. Create a new issue with detailed information
3. Consider contributing improvements via pull requests

---

Built with ❤️ for GitHub Copilot users who want to understand their usage patterns.