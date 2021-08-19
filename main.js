// ==UserScript==
// @name         hs-wisp
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Display what is streamer playing in hearthstone battleground
// @author       Longern
// @downloadURL  https://gitee.com/longern/hs-wisp/raw/main/main.js
// @include      https://www.douyu.com/*
// @include      https://www.huya.com/*
// @include      https://www.twitch.tv/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// @connect      127.net
// @connect      blizzard.cn
// ==/UserScript==

/* global cv, GM_addElement */

(function() {
    'use strict';
    const script = GM_addElement('script', {
        src: "https://docs.opencv.org/3.4.0/opencv.js",
    });
    document.head.appendChild(script);

    const screenshotCanvas = document.createElement("canvas");
    screenshotCanvas.width = 262;
    screenshotCanvas.height = 314;

    const API_BASE_URL = "https://hs.blizzard.cn/action/hs/cards/battleround";
    const cardImageUrls = {};
    GM_xmlhttpRequest({
        method: "GET",
        url: `${API_BASE_URL}?type=hero`,
        responseType: "json",
        onload(res) {
            let childIds = [];
            for (let card of res.response.cards) {
                cardImageUrls[card.id] = card;
                childIds.push(...card.childIds);
            }
            const childCardsUrl = `${API_BASE_URL}?ids=${childIds.join(",")}`;
            GM_xmlhttpRequest({
                method: "GET",
                url: childCardsUrl,
                responseType: "json",
                onload(res) {
                    for (let card of res.response.cards) {
                        cardImageUrls[card.id] = card;
                    }
                },
            });
        },
    });

    async function imReadURL(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url,
                responseType: "blob",
                onload(res) {
                    const reader = new FileReader();
                    reader.onloadend = function() {
                        const image = document.createElement('img');
                        image.src = reader.result;
                        image.onload = () => resolve(image);
                    }
                    reader.readAsDataURL(res.response);
                },
            });
        });
    }

    let bestMatch = null;
    let cardImages = null;
    let tooltipArea = null;

    function refreshHeroTooltip() {
        if (tooltipArea === null) {
            tooltipArea = document.createElement("div");
            tooltipArea.style.position = "fixed";
            tooltipArea.style.zIndex = "999";
            document.body.appendChild(tooltipArea);
        }

        const video = document.querySelector("video");
        const rect = video.getBoundingClientRect();
        tooltipArea.style.left = (rect.left + 0.4671 * rect.width) + "px";
        tooltipArea.style.top = (rect.top + 0.6897 * rect.height) + "px";
        tooltipArea.style.width = (0.0676 * rect.width) + "px";
        tooltipArea.style.height = (0.1430 * rect.height) + "px";

        if (bestMatch === null) return;
        tooltipArea.title = "主播在玩" + cardImageUrls[bestMatch].name;
        for (let cardId of cardImageUrls[bestMatch].childIds) {
            const card = cardImageUrls[cardId];
            tooltipArea.title += `\n${card.name}：${card.text.replace(/<[^>]+>/g, "")}`;
        }
    }

    function refreshHero() {
        const video = document.querySelector("video");
        if (video === null) return;

        refreshHeroTooltip();

        if (typeof cv === "undefined") return;

        for (let card in cardImageUrls) {
            if (cardImages !== null && card in cardImages) continue;
            if (!cardImageUrls[card].battlegrounds.hero) continue;

            const roi = new cv.Rect(58, 100, 262, 314);
            imReadURL(cardImageUrls[card].image).then(img => {
                if (cardImages === null) cardImages = {};
                cardImages[card] = cv.imread(img).roi(roi);
            });
        }

        if (cardImages === null) return;

        var context = screenshotCanvas.getContext('2d');
        const sr = [
            0.4671 * video.videoWidth,
            0.6897 * video.videoHeight,
            0.0676 * video.videoWidth,
            0.1430 * video.videoHeight,
        ];
        context.drawImage(video, ...sr, 0, 0, 262, 314);
        const screenshot = cv.imread(screenshotCanvas);

        let minSum = 255. * 4;
        for (let card in cardImages) {
            let dst = new cv.Mat();
            cv.absdiff(screenshot, cardImages[card], dst);
            const diffSum = cv.mean(dst).reduce((a, b) => a + b);
            if (diffSum < minSum) {
                minSum = diffSum;
                bestMatch = card;
            }
            dst.delete();
        }

        if (minSum > 120) bestMatch = null;

        screenshot.delete();
    }

    setInterval(refreshHero, 5000);
})();
