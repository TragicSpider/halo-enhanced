# Halo Enhanced Chrome Extension

**Author:** Jonathan Bergeron

## Overview

Halo Enhanced is a Chrome extension that adds a "What If?" grade calculator to the Halo learning platform. It allows students to estimate their final course grade by entering hypothetical scores for upcoming assignments.

This feature exists in Canvas, and I missed having it available in Halo, so I built this extension to replicate and improve that functionality.

![What-If Mode](screenshots/whatif-main.png)
## Features

- "What If?" grade calculator for assignments
- Real-time grade projection
- Seamless integration with Halo's interface
- Lightweight and privacy-friendly (no data collection)

## Installation

1. Download this repository as a ZIP file or clone it.
2. If downloaded as a ZIP, extract (unzip) the folder first.
3. Open the extracted folder and make sure it contains `manifest.json`.
   - If there is another folder inside, open that one instead.
4. Open Chrome and navigate to `chrome://extensions`.
5. Enable **Developer Mode** (top right).
6. Click **Load unpacked**.
7. Select the folder that contains `manifest.json`.

## Usage

1. Open Halo in your browser.
   ![Halo URL In Browser](screenshots/halo-url.png)
2. Navigate to your grades page.
   ![Grades Page Button](screenshots/grades-button.png)
3. Click the "What If?" button added by the extension.
   ![What-If Button](screenshots/whatif-button.png)
4. Enter estimated scores for assignments.
   ![What-If Score Input](screenshots/whatif-score-input.png)
5. View your projected final grade.
   ![What-If Projected Grade](screenshots/whatif-projected-grade.png)

## Technologies Used

- JavaScript
- Chrome Extensions API (Manifest V3)
- HTML/CSS

## Motivation

Many students rely on "What If?" tools to plan their academic performance. Since Halo lacked this feature, I developed this extension to improve usability and student success.

## License

MIT License

## Disclaimer

This project is not affiliated with or endorsed by Halo or Grand Canyon University.
