// ==UserScript==
// @name         keybinds (Blue Marble addon)
// @namespace    https://kutt.it/meqa
// @version      0.1.2
// @description  Adds a configurable keybind menu with multi-key support to the Blue Marble UI for common actions
// @author       meqativ, gemini
// @homepageURL  https://kutt.it/meqa
// @match        https://wplace.live/*
// @downloadURL  https://raw.githubusercontent.com/gay-coders/wplace-scripts/refs/heads/main/keybinds.user.js
// @updateURL    https://raw.githubusercontent.com/gay-coders/wplace-scripts/refs/heads/main/keybinds.user.js
// @grant        GM_addStyle
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==

(async function() {
    'use strict';

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    async function doWhenTrue(predicate, cb, maxTries = 100, interval = 100) {
        let i = 0;
        while (!predicate()) {
            i++;
            if (i > maxTries) return cb(false, { predicate, maxTries, interval, cb, attempts: i });
            await sleep(interval);
        }
        cb(true, { predicate, maxTries, interval, cb, attempts: i });
    }

    async function sleepTillTrue(predicate, maxTries = 100, interval = 100) {
        return new Promise((res, rej) => {
            doWhenTrue(predicate, function(success, data) {
                if (!success) return rej(new Error(`Predicate didn't match after ${data.attempts} attempts.`));
                res();
            }, maxTries, interval);
        });
    }

    function findGlobal(predicate) {
        return [...document.querySelectorAll('.flex.flex-col > button')].find(predicate);
    }

    const BUTTONS = {
        index: {
            action: "M240-120q-45 0-89-22t-71-58q26 0 53-20.5t27-59.5q0-50 35-85t85-35q50 0 85 35t35 85q0 66-47 113t-113 47Zm230-240L360-470l358-358q11-11 27.5-11.5T774-828l54 54q12 12 12 28t-12 28L470-360Z",
            zoomIn: () => findGlobal(btn => btn.innerHTML === "+"),
            zoomOut: () => findGlobal(btn => btn.innerHTML === "-"),
            eraser: "M690-240h190v80H610l80-80Zm-500 80-85-85q-23-23-23.5-57t22.5-58l440-456q23-24 56.5-24t56.5 23l199 199q23 23 23 57t-23 57L520-160H190Zm296-80 314-322-198-198-442 456 64 64h262Zm-6-240Z",
            colorPicker: "M120-120v-190l358-358-58-56 58-56 76 76 124-124q5-5 12.5-8t15.5-3q8 0 15 3t13 8l94 94q5 6 8 13t3 15q0 8-3 15.5t-8 12.5L705-555l76 78-57 57-56-58-358 358H120Zm80-80h78l332-334-76-76-334 332v78Zm447-410 96-96-37-37-96 96 37 37Zm0 0-37-37 37 37Z",
            opacity: [
              "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm240-400v80h80v-80h-80Zm-160 0v80h80v-80h-80Zm80 80v80h80v-80h-80Zm160 0v80h80v-80h-80Zm-320 0v80h80v-80h-80Zm400-80v80h80v80h80v-80h-80v-80h-80ZM280-360v80h-80v80h80v-80h80v80h80v-80h80v80h80v-80h80v80h80v-80h-80v-80h-80v80h-80v-80h-80v80h-80v-80h-80Zm480-160v80-80Zm0 160v80-80Z",
              "M440-440v-80h80v80h-80Zm-80 80v-80h80v80h-80Zm160 0v-80h80v80h-80Zm80-80v-80h80v80h-80Zm-320 0v-80h80v80h-80Zm-80 320q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm80-80h80v-80h-80v80Zm160 0h80v-80h-80v80Zm320 0v-80 80Zm-560-80h80v-80h80v80h80v-80h80v80h80v-80h80v80h80v-80h-80v-80h80v-320H200v320h80v80h-80v80Zm0 80v-560 560Zm560-240v80-80ZM600-280v80h80v-80h-80Z"
            ],
        },
        getButton(name = "Unknown") {
            let selector = this.index[name];
            if (!selector) {
                console.error(`Invalid button key (passed: ${name})`);
                return null;
            }
            if (typeof selector === "string") selector = [selector]
            const btn = typeof selector === "function" ? selector() : selector.map(p => document.querySelector(`button:has(svg path[d="${p}"])`)).find(a=>!!a);
            if (!btn) {
              console.error(`Button ${name} not found on page`)
              return null
            }
            return btn;
        }
    }

    const keybindableActions = [
        { id: 'action', name: 'Actions UI', defaultKey: ['a'] },
        { id: 'zoomIn', name: 'Zoom In', defaultKey: ['=', '+'] },
        { id: 'zoomOut', name: 'Zoom Out', defaultKey: ['-'] },
        { id: 'eraser', name: "Eraser", defaultKey: ["e", "x"]},
        { id: 'colorPicker', name: "Color Picker", defaultKey: ["p", "z"]},
        { id: 'opacity', name: 'Opacity (hold)', defaultKey: ['v'], holdInteraction: true },
    ];

    const STORAGE_KEY = 'blueMarble_keybinds_v2'; // Version bump for new data structure
    const defaultBinds = keybindableActions.reduce((acc, action) => {
        acc[action.id] = [...action.defaultKey];
        return acc;
    }, {});

    let currentBinds = await GM.getValue(STORAGE_KEY, defaultBinds);

    // Migration logic for old string-based settings
    for (const id in currentBinds) {
        if (typeof currentBinds[id] === 'string') {
            currentBinds[id] = [currentBinds[id]];
        }
    }



    GM_addStyle(`
div[id^="bm-"]:has(hr[style="display: none;"]) .bm-keybind-container { display: none; }
.bm-keybind-container { margin-top: 0.5em; margin-bottom: 0.5em; font-size: small; }
.bm-keybind-toggle { width: 100%; text-align: left; padding: 4px 8px !important; margin-bottom: 4px; font-size: small; display: flex; justify-content: space-between; align-items: center; }
.bm-keybind-content { max-height: 0; overflow: hidden; transition: max-height 0.3s ease-in-out; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; padding: 0 6px; }
.bm-keybind-content.visible { max-height: 200px; padding: 6px; overflow: scroll; }
.bm-keybind-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.bm-keybind-row:last-child { margin-bottom: 0; }
.bm-keybind-input { background-color: rgba(0, 0, 0, 0.2); color: white; border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 4px; padding: 2px 6px; width: 120px; text-align: center; font-family: 'Roboto Mono', monospace; }
.bm-keybind-input:focus { outline: none; border-color: #2e97ff; }
.bm-keybind-toggle-arrow { transition: transform 0.3s ease-in-out; }
.bm-keybind-toggle-arrow.down { transform: rotate(180deg); }
.bm-keybind-revert-btn { width: 100%; margin-top: 4px; padding: 2px !important; }
    `);
    const activeKeys = new Set();
        function handleKeyEvent(e, eventType) {
        if (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            return;
        }

        const pressedKey = e.key.toLowerCase();
        const action = keybindableActions.find(a => currentBinds[a.id]?.map(k => k.toLowerCase()).includes(pressedKey));
        if (!action) return;

        let button;
        try {
            button = BUTTONS.getButton(action.id);
        } catch (e) {}

        if (!button) return;

        e.preventDefault();
        e.stopPropagation();

        if (eventType === 'keydown') {
            if (e.repeat || activeKeys.has(pressedKey)) return;
            activeKeys.add(pressedKey);
            button.click();
        } else if (eventType === 'keyup') {
            if (!activeKeys.has(pressedKey)) return;
            activeKeys.delete(pressedKey);

            if (action.holdInteraction) {
              button.click();
            }
        }
    }

    document.addEventListener('keydown', (e) => handleKeyEvent(e, 'keydown'));
    document.addEventListener('keyup', (e) => handleKeyEvent(e, 'keyup'));

    document.addEventListener('keydown', (e) => handleKeyEvent(e, 'keydown'));
    document.addEventListener('keyup', (e) => handleKeyEvent(e, 'keyup'));

    await sleepTillTrue(() => {
        const out = document.querySelector('div[id^="bm-"] img');
        return out && out.src.endsWith("Favicon.png");
    });

    if (document.getElementById('bm-keybind-container')) return;

    const anchor = document.querySelector('div[id^="bm-"] > textarea[id^="bm-"] + div');
    if (!anchor) {
        console.error("Blue Marble Keybinds: Could not find UI injection point.");
        return;
    }

    const container = document.createElement('div');
    container.id = 'bm-keybind-container';
    container.className = 'bm-keybind-container';

    const toggleButton = document.createElement('button');
    toggleButton.className = 'bm-keybind-toggle';
    toggleButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff" style="scroll-behavior: auto !important;">
        <path d="M172.31-220Q142-220 121-241q-21-21-21-51.31v-375.38Q100-698 121-719q21-21 51.31-21h615.38Q818-740 839-719q21 21 21 51.31v375.38Q860-262 839-241q-21 21-51.31 21H172.31Zm0-60h615.38q4.62 0 8.46-3.85 3.85-3.84 3.85-8.46v-375.38q0-4.62-3.85-8.46-3.84-3.85-8.46-3.85H172.31q-4.62 0-8.46 3.85-3.85 3.84-3.85 8.46v375.38q0 4.62 3.85 8.46 3.84 3.85 8.46 3.85Zm152.31-44.62h310.76v-70.76H324.62v70.76Zm-120-120h70.76v-70.76h-70.76v70.76Zm120 0h70.76v-70.76h-70.76v70.76Zm120 0h70.76v-70.76h-70.76v70.76Zm120 0h70.76v-70.76h-70.76v70.76Zm120 0h70.76v-70.76h-70.76v70.76Zm-480-120h70.76v-70.76h-70.76v70.76Zm120 0h70.76v-70.76h-70.76v70.76Zm120 0h70.76v-70.76h-70.76v70.76Zm120 0h70.76v-70.76h-70.76v70.76Zm120 0h70.76v-70.76h-70.76v70.76ZM160-280v-400 400Z"/>
      </svg><span>Keybinds</span><svg class="bm-keybind-toggle-arrow" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff" style="scroll-behavior: auto !important;">
        <path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/>
      </svg>
    `

    const content = document.createElement('div');
    content.className = 'bm-keybind-content';

    const revertButton = document.createElement('button');
    revertButton.textContent = 'Revert to Defaults';
    revertButton.className = 'bm-keybind-revert-btn';
    revertButton.addEventListener('click', async () => {
        if (confirm('Are you sure you want to revert all keybinds to their default settings?')) {
            currentBinds = JSON.parse(JSON.stringify(defaultBinds)); // Deep copy
            await GM.setValue(STORAGE_KEY, currentBinds);
            document.querySelectorAll('.bm-keybind-input').forEach(input => {
                const actionId = input.dataset.actionId;
                if (actionId) {
                    input.value = currentBinds[actionId]?.join(', ') || 'None';
                }
            });
        }
    });
    content.appendChild(revertButton);

    keybindableActions.forEach(action => {
        const row = document.createElement('div');
        row.className = 'bm-keybind-row';

        const label = document.createElement('span');
        label.textContent = action.name;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'bm-keybind-input';
        input.value = currentBinds[action.id]?.join(', ') || 'None';
        input.dataset.actionId = action.id;
        input.readOnly = true;

        input.addEventListener('focus', () => input.value = 'Press a key...');
        input.addEventListener('blur', () => input.value = currentBinds[action.id]?.join(', ') || 'None');
        input.addEventListener('keydown', e => {
            e.preventDefault();
            e.stopPropagation();

            let key = e.key;
            const keys = currentBinds[action.id] || [];

            if (key === 'Escape') {
                currentBinds[action.id] = [];
            } else {
                if (key === ' ') key = 'Space';
                const keyIndex = keys.map(k => k.toLowerCase()).indexOf(key.toLowerCase());

                if (keyIndex > -1) { // Key exists, so remove it
                    keys.splice(keyIndex, 1);
                } else { // Key doesn't exist, so add it
                    keys.push(key);
                }
                currentBinds[action.id] = keys;
            }

            GM.setValue(STORAGE_KEY, currentBinds);
            input.blur(); // Triggers the blur event to update display
        });

        row.appendChild(label);
        row.appendChild(input);
        content.appendChild(row);
    });



    container.appendChild(toggleButton);
    container.appendChild(content);

    let arrow;
    toggleButton.addEventListener('click', () => {
      if (!arrow) arrow = document.querySelector(".bm-keybind-toggle .bm-keybind-toggle-arrow")
        content.classList.toggle('visible');
        arrow.classList.toggle('down');
    });
    anchor.parentNode.insertBefore(container, anchor);
  console.log("Blue Marble keybinds addon loaded")
})();
