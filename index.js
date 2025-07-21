import puppeteer from "puppeteer";
import dotenv from "dotenv";
import { analyzePost } from "./gpt.js";
import { writeToSheet } from "./sheets.js";
import fs from "fs";

dotenv.config();

const searchKeywords = ["食藥署", "食品安全", "藥物供應", "藥品短缺", "添加物", "主管機關"];
const delay = ms => new Promise(res => setTimeout(res, ms));

async function launchBrowser() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const cookies = JSON.parse(fs.readFileSync("./cookies.json", "utf8"));
  await page.setCookie(...cookies);
  await page.goto("https://www.facebook.com/", { waitUntil: "networkidle2" });
  return { browser, page };
}

async function searchAndScrape(page, keyword) {
  await page.goto(`https://www.facebook.com/search/posts/?q=${encodeURIComponent(keyword)}`, {
    waitUntil: "domcontentloaded",
  });
  await delay(3000);
  const posts = await page.evaluate(() => {
    const data = [];
    const containers = document.querySelectorAll("div[data-ad-preview='message']");
    containers.forEach((el) => {
      const text = el.innerText;
      const timeEl = el.closest("[data-utime]");
      const timestamp = timeEl ? timeEl.getAttribute("data-utime") : null;
      data.push({
        content: text,
        timestamp: timestamp ? new Date(parseInt(timestamp) * 1000).toLocaleString() : "未知時間",
        url: window.location.href,
      });
    });
    return data.slice(0, 5);
  });
  return posts;
}

async function run() {
  const { browser, page } = await launchBrowser();
  for (let keyword of searchKeywords) {
    const posts = await searchAndScrape(page, keyword);
    for (let post of posts) {
      const analysis = await analyzePost(post.content);
      const row = {
        貼文時間: post.timestamp,
        發文者: "未知",
        貼文內文（原文）: post.content,
        分析摘要: analysis.summary,
        意圖分類: analysis.intent,
        情緒傾向: analysis.sentiment,
        與TFDA相關性: analysis.relevance,
        來源連結: post.url,
      };
      await writeToSheet(row);
      console.log(`✅ 已寫入一筆：${row.貼文內文（原文）.substring(0, 20)}...`);
    }
  }
  await browser.close();
}

run().catch(console.error);
