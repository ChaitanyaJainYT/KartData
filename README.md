# KartData

# GoPro Telemetry Extractor & Video Gate Analyzer Suite

This repository contains two browser-based tools designed to extract, visualize, and analyze telemetry data from GoPro cameras. The primary application is a robust, interactive dashboard for track analysis and video synchronization, complemented by a dedicated high-precision extraction tool.

## 🏁 1. GoPro GPS Telemetry & Video Gate Analyzer (Main Tool)

The **KARTDATA Precision Telemetry Suite** is a comprehensive analytics dashboard for motorsports and action sports. It allows you to visualize your GPS tracks, automatically calculate lap times, and sync your raw data with video playback.

### Key Features

* **Interactive Track Mapping:** Uses Leaflet to plot your exact GPS path on a map.


* **Automatic Lap Splitting:** Draw a gate line directly across the track on the map to automatically split and calculate your laps.


* **Advanced Data Visualization:** Features interactive "Speed vs Distance" and "Speed vs Time" charts powered by Plotly.


* **Data Smoothing:** Includes a slider (adjustable from 0 to 20) to apply data smoothing to your telemetry charts.


* **Video Synchronization:** Sync your video playback directly to your telemetry. It supports both "Distance" and "Time" tracking modes, alongside variable playback speeds ranging from 0.25x to 8.0x.


* **Direct Extraction:** Features a built-in toggle to extract telemetry directly from an uploaded video file without needing a separate CSV.


* **Lap Management:** Sort laps by time, view lap visibility, and automatically highlight your best lap.


* **Customizable UI:** Fully responsive design with a Dark/Light mode toggle.



### How to Use

1. Open the tool in your web browser.
2. Upload a CSV file containing your GPS and speed data, or upload a video file directly.


3. Click **"Set Gate"** and click on the map to draw the start and end points of your start/finish line. The tool will automatically calculate your splits.


4. Upload your video via the **"Add Video"** button to sync playback with your data.



---

## 🛠️ 2. GoPro HERO11 - High Precision Extractor

A lightweight, standalone tool designed specifically for deep data extraction.

### Key Features

* **Full Sensor Extraction:** Extracts and merges all available sensors—GPS9, ACCL, GYRO, GRAV, and CORI.


* **Timestamp Alignment:** Combines all sensor data into a single row-per-timestamp format for easy database management or advanced analysis.


* **Local Processing:** Uses MP4Box to read the GPMD track structure entirely in your browser.



### How to Use

1. Open the extractor tool in your browser.
2. Drop your GoPro MP4 file into the designated upload zone.


3. Wait for the processing to finish, then click **"Download Combined CSV"** to save your `_Full_Telemetry.csv` file.



---

## 💻 Technologies Used

These tools run entirely on the client side (in-browser) and do not require a backend server.

* **HTML/CSS/JavaScript**: Core structure and logic.
* **Tailwind CSS**: For styling the Analyzer interface.


* **Leaflet.js**: For interactive map rendering.


* **Plotly.js**: For rendering the speed, distance, and time charts.


* **PapaParse**: For efficient CSV parsing.


* **MP4Box.js**: For extracting the GPMD telemetry track directly from MP4 files.



## 🚀 Getting Started

Simply clone this repository and open the HTML files directly in any modern web browser to start analyzing your data. No installation or build steps are required.