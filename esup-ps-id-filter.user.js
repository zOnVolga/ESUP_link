// ==UserScript==
// @name         ЕСУП-ПС Автофильтр по ID (v.7.1 | 2025-05-26)
// @namespace    http://tampermonkey.net/
// @version      7.1
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

    // Защита от повторного запуска
    if (window.scriptAlreadyRun) return;
    window.scriptAlreadyRun = true;

    // === Вывод баннера на страницу (многоуровневый стек) ===
    function showBanner(message, type = 'info') {
        const containerId = 'automation-banner-container';
        let container = document.getElementById(containerId);

        // Создаём контейнер, если его нет
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.position = 'fixed';
            container.style.top = '10px';
            container.style.right = '10px';
            container.style.zIndex = '99999';
            container.style.display = 'flex';
            container.style.flexDirection = 'column-reverse';
            container.style.gap = '8px';
            container.style.maxWidth = '90%';
            container.style.listStyle = 'none';
            container.style.padding = '0';
            container.style.margin = '0';
            document.body.appendChild(container);
        }

        // Создаём сам баннер
        const banner = document.createElement('div');
        banner.style.background = '#fff3cd';
        banner.style.color = '#856404';
        banner.style.borderLeft = '4px solid #856404';
        banner.style.padding = '10px 15px';
        banner.style.borderRadius = '4px';
        banner.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
        banner.style.fontFamily = 'Arial, sans-serif';
        banner.style.fontSize = '14px';
        banner.style.opacity = '1';
        banner.style.transition = 'opacity 0.5s ease-out';
        banner.style.boxSizing = 'border-box';
        banner.style.width = 'max-content';
        banner.style.maxWidth = '100%';
        banner.style.wordBreak = 'break-word';

        // === Цвета в зависимости от типа ===
        switch (type) {
            case 'error':
                banner.style.background = '#f8d7da';
                banner.style.color = '#721c24';
                banner.style.borderLeftColor = '#721c24';
                banner.textContent = message
                break;
            case 'success':
                banner.style.background = '#d4edda';
                banner.style.color = '#155724';
                banner.style.borderLeftColor = '#155724';
                banner.textContent = message;
                break;
            default:
                banner.textContent = message;
                break;
        }

        // Вставляем баннер сверху
        container.insertBefore(banner, container.firstChild);

        // Автоматическое исчезновение через 10 секунд
        setTimeout(() => {
            banner.style.opacity = '0';
            setTimeout(() => {
                if (banner.parentElement === container) {
                    banner.remove();
                }
            }, 500);
        }, 10000);
    }

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
        showBanner('❌Ошибка: Параметры Мероприятие или ID не найдены', 'error');
        return;
    }

    console.log(`Получены параметры: vid_rabot=${vid_rabot}, ID=${ID}`);
    showBanner(`Получены параметры: ${vid_rabot} | ID=${ID}`, 'info');

    // === Активируем раздел через Kendo TreeView ===
    function activateSectionManually(sectionName) {
        const treeElement = document.getElementById('treeView_ContractService');
        if (!window.jQuery || !treeElement) return;

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
            showBanner(`❌Ошибка: Раздел "${sectionName}" не найден`, 'error');
            return;
        }

        const nodeElement = treeView.findByUid(foundNode.uid);
        if (nodeElement) {
            treeView.select(nodeElement);
            console.log(`Раздел "${sectionName}" активирован через Kendo.select()`);
        }

        if (typeof structDocTreeSelected_ContractService === 'function') {
            console.log('Вызываем structDocTreeSelected_ContractService вручную', foundNode);
            structDocTreeSelected_ContractService(null, foundNode);
        } else {
            console.error('structDocTreeSelected_ContractService не определена');
        }

        // Ждём окончания загрузки таблицы
        waitForTable(() => {
            applyFiltersSequentially(ID, vid_rabot);
        });
    }

    // === Ожидание полной загрузки таблицы ===
    function waitForTable(callback, attempt = 0, maxAttempts = 30) {
        const grid = document.getElementById('grid_ContractService');
        if (!grid || grid.style.display === 'none' || grid.innerHTML.trim() === '') {
            if (attempt < maxAttempts) {
                setTimeout(() => waitForTable(callback, attempt + 1, maxAttempts), 200);
            } else {
                console.warn('❌ Таблица так и не загрузилась');
            }
            return;
        }

        callback();
    }

    // === Последовательное применение фильтров: ID → Статус ===
    function applyFiltersSequentially(id, sectionName) {
        applyIDFilter(id, () => {
            setTimeout(() => {
                const statusHeader = findStatusHeader();
                if (statusHeader) {
                    changeStatusFilter(sectionName);
                } else {
                    console.warn('⚠️ Заголовок "Статус" или "Статус мероприятия" не найден — пропускаем фильтр статуса');
                }
            }, 800);
        });
    }

    // === Поиск заголовка "Статус" или "Статус мероприятия" ===
    function findStatusHeader(attempt = 0, maxAttempts = 10) {
        const possibleHeaders = [...document.querySelectorAll('th[data-title="Статус"], th[data-title="Статус мероприятия"]')];

        for (const header of possibleHeaders) {
            if (header.textContent.trim() === 'Статус' || header.textContent.trim() === 'Статус мероприятия') {
                return header;
            }
        }

        if (attempt < maxAttempts) {
            setTimeout(() => findStatusHeader(attempt + 1, maxAttempts), 300);
        } else {
            console.warn('❌ Ни один из заголовков "Статус" / "Статус мероприятия" не найден');
        }

        return null;
    }

    // === Применяем фильтр по ID ===
    function applyIDFilter(id, callback) {
        const idHeader = [...document.querySelectorAll('th[data-field="ActivityId"]')].find(th =>
            th.textContent.trim() === 'ID'
        );
        if (!idHeader) {
            console.warn('❌ Заголовок ID не найден');
            return;
        }

        const filterButton = idHeader.querySelector('.k-grid-filter');
        if (!filterButton) {
            console.warn('❌ Кнопка фильтра по ID не найдена');
            return;
        }

        filterButton.click();
        console.log('✅ Кнопка фильтра ID нажата');

        const checkForm = setInterval(() => {
            const form = document.querySelector('.k-filter-menu-container');
            if (form) {
                clearInterval(checkForm);

                const input = form.querySelector('.k-textbox');
                if (input) {
                    input.value = id;

                    ['input', 'change'].forEach(type => {
                        const event = new Event(type, { bubbles: true });
                        input.dispatchEvent(event);
                    });

                    // Имитация Enter для применения фильтра
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true
                    });
                    input.dispatchEvent(enterEvent);
                    console.log(`✅ Нажат Enter для фильтрации по ID=${id}`);
                }

                if (callback) callback();
            }
        }, 300);
    }

    // === Функция фильтрации по статусу: клик → выбрать всё → Enter ===
    function changeStatusFilter(sectionName, attempt = 0, maxAttempts = 10) {
        const statusHeader = findStatusHeader();

        if (!statusHeader) {
            console.warn('❌ Заголовок статуса не найден');
            return;
        }

        const filterButton = statusHeader.querySelector('.k-grid-filter');
        if (!filterButton) {
            console.warn('❌ Кнопка фильтра статуса не найдена');
            return;
        }

        filterButton.click();
        console.log('✅ Кнопка фильтра "Статус" нажата');

        setTimeout(() => {
            const selectAllCheckbox = document.querySelector('input[id^="selectAll"]');
            if (selectAllCheckbox && !selectAllCheckbox.checked) {
                selectAllCheckbox.checked = true;
                const event = new Event('change', { bubbles: true });
                selectAllCheckbox.dispatchEvent(event);
                console.log('✅ Чекбокс "Выделить всё" активирован');
            } else {
                console.log('⚠️ Чекбокс "Выделить всё" не найден или уже выбран');
            }

            // Имитация Enter для применения фильтра
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
            });
            document.activeElement.dispatchEvent(enterEvent);
            console.log('✅ Нажат Enter для применения фильтра статуса');
        }, 800);
      showBanner(`✅ Фильтр применён: Статус - Все | ${vid_rabot} | ${ID}`, 'success');
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
