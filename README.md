---

# CEORater

**CEORater** is a web-based dashboard that ranks and analyzes NASDAQ-100 CEOs based primarily on Total Shareholder Return (TSR) performance vs. the benchmark (QQQ), as well as CEO compensation metrics.

We believe a CEO's core responsibility is to generate shareholder returns that consistently outperform the broader market. CEORater provides objective tools and metrics to measure this outperformance—commonly referred to as **"alpha."**

---

## 🔍 Key Features

### ✅ AlphaScore (Proprietary CEO Rating)

CEORater’s **AlphaScore** is a 0–100 rating that ranks a CEO's performance relative to NASDAQ-100 peers. A higher score reflects superior, risk-adjusted value creation.

#### How AlphaScore is Calculated:

1. **Percentile Ranking:**

   * **TSR vs. QQQ**: Percentile rank of the CEO's total TSR compared to the Invesco QQQ Trust.
   * **Avg Annual TSR vs. QQQ**: Percentile rank of the CEO's average annual TSR vs. QQQ.
2. **Blended Score:**

   * The final AlphaScore is the average of the two percentile ranks.

This methodology rewards both magnitude and consistency of outperformance.

---

### 📊 CEO Comparisons

Directly compare CEOs across all tracked metrics.

---

### 🧰 Filter Tabs

Easily filter by:

* **Performance**
* **Compensation**
* **Founder status (Y/N)**
* Other key metrics:

#### Metric Definitions:

* **TSR During Tenure**: Total shareholder return (stock price + dividends) over the CEO's full tenure.
* **TSR vs. QQQ**: The difference between the CEO's TSR and QQQ's TSR over the same time frame.
* **Avg Annual TSR**: TSR divided by the CEO's tenure in years.
* **Avg Annual TSR vs. QQQ**: CEO's Avg Annual TSR minus QQQ's Avg Annual TSR.

---

## 🛠 Tech Stack

* **Frontend**: HTML5, CSS3, JavaScript
* **Styling**: Tailwind CSS

---

## 🚀 Run Locally

1. Clone or download the repository:

   ```bash
   git clone https://github.com/your-username/ceorater.git
   ```
2. Open `index.html` in your preferred web browser.

---

## 🎯 Purpose

CEORater aims to deliver a **Bloomberg-quality interface** for both retail and institutional investors—using only publicly available data.

---
