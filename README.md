# 20250706 隕石開發

目前先將仁偉的原始版本 ![](./map_t01.html) 拆分成其他三個檔案。**目前只是簡單修改與 demo，後續要接手開發可以直接下載或 clone，不需要繼續 commit 在這個 repo**

## How to run
1. 下載或 clone 此 repo
2. local 用 `python -m http.server` 或 `python3 -m http.server` 啟動一個 local server
3. 在瀏覽器中打開 `index.html`，即可看到目前的 demo

## File Structure

- ![](./map_t01.html) - 原始版本
- source code
  - [`./election_data.csv`](./election_data.csv) - 後續的 geo data 可以參考此格式，以利與目前的網頁對接
  - [`./script.js`](./script.js)
  - [`./style.css`](./style.css)
  - [`./index.html`](./index.html)