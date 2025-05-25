// ==UserScript==
// @name         ЕСУП-ПС Автофильтр по ID (v.6.7 | 2025-05-25)
// @namespace    http://tampermonkey.net/
// @version      6.7
// @description  Быстрая фильтрация по ID в ЕСУП-ПС после полной загрузки таблицы
// @author       zOnVolga
// @match        https://esup-ps.megafon.ru/*
// @icon         https://esup-ps.megafon.ru/favicon.svg
// @grant        none
// @updateURL    https://github.com/zOnVolga/ESUP_link/raw/refs/heads/main/esup-ps-id-filter.user.js
// @downloadURL  https://github.com/zOnVolga/ESUP_link/raw/refs/heads/main/esup-ps-id-filter.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Получаем параметры из URL
    const parseURLParams = () => {
        const hash = window.location.hash || window.location.search;
        const params = new URLSearchParams(hash.replace(/^#/, '?'));

        return {
            vid_rabot: decodeURIComponent(params.get('vid_rabot')?.replace(/"/g, '') || ''),
            ID: params.get('ID') || ''
        };
    };

    const { vid_rabot, ID } = parseURLParams();

    if (!vid_rabot || !ID) {
        console.log('Параметры vid_rabot или ID не найдены');
        alert('❌ Ошибка: Параметры vid_rabot или ID не найдены');
        return;
    }

    console.log(`Получены параметры: vid_rabot=${vid_rabot}, ID=${ID}`);

    // === Активируем раздел через Kendo TreeView ===
    function activateSectionManually(sectionName) {
        const treeElement = document.getElementById('treeView_ContractService');
        if (!window.jQuery || !treeElement) {
            console.warn("jQuery или дерево еще не готовы");
            return;
        }

        const $ = window.jQuery;
        const treeView = $('#treeView_ContractService').data('kendoTreeView');

        if (!treeView) return;

        const dataSource = treeView.dataSource;
        if (!dataSource || typeof dataSource.data !== "function") return;

        const treeData = dataSource.data();
        if (!treeData || Object.keys(treeData).length === 0) return;

        // Поиск узла
        const findNodeInTree = (nodes, targetText) => {
            for (const node of Object.values(nodes)) {
                if (node.Name === targetText) return node;
                if (node.Childs && Object.keys(node.Childs).length > 0) {
                    const result = findNodeInTree(node.Childs, targetText);
                    if (result) return result;
                }
            }
            return null;
        };

        const foundNode = findNodeInTree(treeData, sectionName.trim());
        if (!foundNode) {
            console.error(`Раздел "${sectionName}" не найден`);
            alert(`❌ Ошибка:
            Раздел "${sectionName}" не найден.

            ⚠️ Убедитесь, что значение "Мероприятие" в таблице
            соответствет названию в ЕСУП.`);
            return;
        }

        const nodeElement = treeView.findByUid(foundNode.uid);
        if (nodeElement) {
            treeView.select(nodeElement);
            console.log(`Раздел "${sectionName}" активирован через Kendo.select()`);
            showBanner("Загружен раздел: " + sectionName);
        }

        // Вызываем функцию structDocTreeSelected_ContractService вручную
        if (typeof structDocTreeSelected_ContractService === 'function') {
            console.log('Вызываем structDocTreeSelected_ContractService вручную', foundNode);
            structDocTreeSelected_ContractService(null, foundNode);
        } else {
            console.error('structDocTreeSelected_ContractService не определена');
        }

        // Ждём окончания загрузки таблицы
        waitForTable(() => {
            applyIDFilter(ID);
        });
    }

    // === Ожидание полной загрузки таблицы ===
    function waitForTable(callback, attempt = 0, maxAttempts = 30) {
        const grid = document.getElementById('grid_ContractService');
        if (!grid || grid.style.display === 'none' || grid.innerHTML.trim() === '') {
            if (attempt < maxAttempts) {
                setTimeout(() => waitForTable(callback, attempt + 1, maxAttempts), 200);
            } else {
                console.warn('Таблица так и не загрузилась');
            }
            return;
        }

        // Ждём, пока загрузится заголовок ID
        const idHeader = [...document.querySelectorAll('th[data-field="ActivityId"]')].find(th =>
            th.textContent.trim() === 'ID'
        );

        if (!idHeader) {
            if (attempt < maxAttempts) {
                setTimeout(() => waitForTable(callback, attempt + 1, maxAttempts), 200);
            } else {
                console.warn('Заголовок ID так и не появился');
            }
            return;
        }

        callback();
    }

    // === Применяем фильтр по ID ===
    function applyIDFilter(id) {
        const idHeader = [...document.querySelectorAll('th[data-field="ActivityId"]')].find(th =>
            th.textContent.trim() === 'ID'
        );
        if (!idHeader) {
            console.warn('Заголовок ID не найден');
            return;
        }

        const filterButton = idHeader.querySelector('.k-grid-filter');
        if (!filterButton) {
            console.warn('Кнопка фильтра по ID не найдена');
            return;
        }

        // Кликаем по кнопке фильтра
        filterButton.click();
        showBanner("Фильтруем по ID: " + ID);

        // Ждём появления формы фильтрации
        const checkForm = setInterval(() => {
            const form = document.querySelector('.k-filter-menu-container');
            if (form) {
                clearInterval(checkForm);

                const input = form.querySelector('.k-textbox');
                if (input) {
                    input.value = id;

                    // Триггерим события для AngularJS/Kendo
                    ['input', 'change'].forEach(type => {
                        const event = new Event(type, { bubbles: true });
                        input.dispatchEvent(event);
                    });

                    const applyButton = form.querySelector('.k-primary');
                    if (applyButton) {
                        applyButton.click();
                        console.log(`Фильтр по ID=${id} применён`);
                        showBanner("Применен фильтр по ID: " + ID);
                    }
                }
            }
        }, 300);
    }

    function showBanner(message) {
    let banner = document.getElementById('automation-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'automation-banner';
        banner.style.position = 'fixed';
        banner.style.top = '10px';
        banner.style.right = '10px';
        banner.style.backgroundColor = '#fff3cd';
        banner.style.border = '1px solid #ffeeba';
        banner.style.padding = '10px 20px';
        banner.style.zIndex = '99999';
        banner.style.fontFamily = 'Arial';
        banner.style.fontSize = '14px';
        banner.style.borderRadius = '5px';
        document.body.appendChild(banner);
    }
    banner.innerText = message;
    }


    // === Основной запуск ===
    function mainAction() {
        if (window.jQuery && window.jQuery.fn && window.jQuery.fn.kendoTreeView) {
            activateSectionManually(vid_rabot);
        } else {
            setTimeout(mainAction, 300); // минимальная задержка
        }
    }

    // Запускаем почти сразу
    setTimeout(mainAction, 500);
})();
