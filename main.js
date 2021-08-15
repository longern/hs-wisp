// ==UserScript==
// @name         hs-wisp
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Display what is streamer playing in hearthstone battleground
// @author       Longern
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

    const screenshot_canvas = document.createElement("canvas");
    screenshot_canvas.width = 262;
    screenshot_canvas.height = 314;

    const card_image_urls = {};
    GM_xmlhttpRequest({
        method: "GET",
        url: "https://hs.blizzard.cn/action/hs/cards/battleround?type=hero",
        responseType: "json",
        onload(res) {
            for (let card of res.response.cards) {
                card_image_urls[card.id] = card;
            }
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
    let card_images = null;
    let tooltip_area = null;

    function refreshHeroTooltip() {
        if (tooltip_area === null) {
            tooltip_area = document.createElement("div");
            tooltip_area.style.position = "fixed";
            tooltip_area.style.zIndex = "999";
            document.body.appendChild(tooltip_area);
        }

        const video = document.querySelector("video");
        const rect = video.getBoundingClientRect();
        tooltip_area.style.left = (rect.left + 0.4671 * rect.width) + "px";
        tooltip_area.style.top = (rect.top + 0.6897 * rect.height) + "px";
        tooltip_area.style.width = (0.0676 * rect.width) + "px";
        tooltip_area.style.height = (0.1430 * rect.height) + "px";

        if (bestMatch === null) return;
        tooltip_area.title = "主播在玩" + card_image_urls[bestMatch].name;
    }

    function refreshHero() {
        const video = document.querySelector("video");
        if (video === null) return;

        refreshHeroTooltip();

        if (typeof cv === "undefined") return;

        for (let card in card_image_urls) {
            if (card_images !== null && card in card_images) continue;
            const roi = new cv.Rect(58, 100, 262, 314);
            imReadURL(card_image_urls[card].image).then(img => {
                if (card_images === null) card_images = {};
                card_images[card] = cv.imread(img).roi(roi);
            });
        }

        if (card_images === null) return;

        var context = screenshot_canvas.getContext('2d');
        const sr = [
            0.4671 * video.videoWidth,
            0.6897 * video.videoHeight,
            0.0676 * video.videoWidth,
            0.1430 * video.videoHeight,
        ];
        context.drawImage(video, ...sr, 0, 0, 262, 314);
        const screenshot = cv.imread(screenshot_canvas);

        let minSum = 255. * 4;
        for (let card in card_images) {
            let dst = new cv.Mat();
            cv.absdiff(screenshot, card_images[card], dst);
            const diffSum = cv.mean(dst).reduce((a, b) => a + b);
            if (diffSum < minSum) {
                minSum = diffSum;
                bestMatch = card;
            }
            dst.delete();
        }

        if (minSum > 120) bestMatch = null;
    }

    setInterval(refreshHero, 5000);
})();
