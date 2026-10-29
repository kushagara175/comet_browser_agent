/**
 * @privapilot/extension - Declarative Structured Data & Table Extractor
 *
 * Implements high-speed, on-device structured extraction (tables, cards, search results, lists)
 * in a single turn without token-heavy multi-step crawler loops.
 */
import { scrubText } from '@privapilot/pii-rules';
export class TableExtractor {
    /**
     * Extracts structured data from tables, list repeaters, or card containers.
     */
    static extract(rootDoc = typeof document !== 'undefined' ? document : null, options = {}) {
        if (!rootDoc) {
            return {
                success: false,
                count: 0,
                items: [],
                markdown: '',
                summary: 'Root document is unavailable'
            };
        }
        const limit = Math.max(1, Math.min(100, options.limit || 50));
        let container = rootDoc;
        if (options.targetElement) {
            container = options.targetElement;
        }
        else if (options.containerSelector) {
            try {
                const found = rootDoc.querySelector(options.containerSelector);
                if (found)
                    container = found;
            }
            catch (_) { }
        }
        const nextPageHint = this.findNextPageTarget(rootDoc) || undefined;
        // Strategy 1: Check for explicit HTML tables
        const tableResult = this.extractHtmlTables(container, options.schema, limit);
        if (tableResult && tableResult.items.length > 0) {
            return { ...tableResult, nextPageHint };
        }
        // Strategy 2: Check for semantic lists and card repeaters
        const repeaterResult = this.extractCardRepeaters(container, options.schema, limit);
        if (repeaterResult && repeaterResult.items.length > 0) {
            return { ...repeaterResult, nextPageHint };
        }
        // Strategy 3: Generic key-value / section extraction fallback
        const genericResult = this.extractGenericKeyValue(container, limit);
        return { ...genericResult, nextPageHint };
    }
    /**
     * Identifies pagination controls or "Next Page" links for multi-page extractions.
     */
    static findNextPageTarget(rootDoc) {
        if (!rootDoc || typeof rootDoc.querySelectorAll !== 'function')
            return null;
        // 1. Explicit rel="next" links
        const relNext = rootDoc.querySelector('a[rel~="next"], link[rel~="next"]');
        if (relNext && (relNext.href || relNext.getAttribute('href'))) {
            return {
                href: relNext.href || relNext.getAttribute('href') || '',
                text: relNext.textContent?.trim() || 'Next'
            };
        }
        // 2. Links or buttons with aria-label containing "next"
        const ariaNext = rootDoc.querySelector('a[aria-label*="next" i], button[aria-label*="next" i]');
        if (ariaNext) {
            return {
                href: ariaNext.href || '',
                text: ariaNext.getAttribute('aria-label') || ariaNext.textContent?.trim() || 'Next'
            };
        }
        // 3. Scan interactive elements with "Next", "Load More", or chevron symbols
        const candidates = Array.from(rootDoc.querySelectorAll('a, button, [role="button"]'));
        for (const cand of candidates) {
            const text = (cand.textContent || '').trim();
            if (/^(?:next(?:\s*(?:page|>|»|→))?|load\s*more|older(?:\s*posts)?)$/i.test(text)) {
                return {
                    href: cand.href || '',
                    text
                };
            }
        }
        return null;
    }
    /**
     * Extracts data from HTML <table>, <tbody>, or ARIA [role="table"] elements.
     */
    static extractHtmlTables(container, schema, limit = 50) {
        let tables = [];
        if (container && container.tagName === 'TABLE') {
            tables = [container];
        }
        else {
            tables = Array.from(container.querySelectorAll('table'));
            if (tables.length === 0) {
                tables = Array.from(container.querySelectorAll('[role="table"], [role="grid"]'));
            }
        }
        if (tables.length === 0)
            return null;
        // Pick the most substantial table (most rows)
        let bestTable = null;
        let maxRows = 0;
        for (const tbl of tables) {
            const rows = tbl.querySelectorAll('tr');
            const count = rows ? rows.length : 0;
            if (count > maxRows) {
                maxRows = count;
                bestTable = tbl;
            }
        }
        if (!bestTable || maxRows < 2)
            return null;
        // 1. Determine headers
        const headers = [];
        const headerRow = bestTable.querySelector('thead tr') || bestTable.querySelector('tr');
        if (headerRow) {
            let ths = Array.from(headerRow.querySelectorAll('th'));
            if (ths.length === 0) {
                ths = Array.from(headerRow.querySelectorAll('td'));
            }
            ths.forEach((th, idx) => {
                const txt = this.cleanText(th.textContent || '');
                headers.push(txt || `column_${idx + 1}`);
            });
        }
        let rows = Array.from(bestTable.querySelectorAll('tbody tr'));
        if (rows.length === 0) {
            rows = Array.from(bestTable.querySelectorAll('tr'));
        }
        const items = [];
        for (const row of rows) {
            if (items.length >= limit)
                break;
            // Skip header rows inside tbody
            if (row.querySelector('th') && !row.querySelector('td'))
                continue;
            let cells = Array.from(row.querySelectorAll('td'));
            if (cells.length === 0) {
                cells = Array.from(row.querySelectorAll('[role="cell"], [role="gridcell"]'));
            }
            if (cells.length === 0)
                continue;
            const record = {};
            cells.forEach((cell, idx) => {
                const colName = headers[idx] || `column_${idx + 1}`;
                const rawText = this.cleanText(cell.textContent || '');
                const sanitized = scrubText(rawText);
                // Check if there is an anchor link in the cell
                const linkEl = cell.querySelector('a[href]');
                if (linkEl && linkEl.href) {
                    record[colName] = sanitized;
                    record[`${colName}_url`] = linkEl.href;
                }
                else {
                    record[colName] = this.coerceValue(sanitized, schema?.fields?.[colName]);
                }
            });
            if (Object.keys(record).length > 0) {
                items.push(record);
            }
        }
        if (items.length === 0)
            return null;
        const markdown = this.recordsToMarkdown(items, headers);
        return {
            success: true,
            count: items.length,
            items,
            markdown,
            summary: `Extracted ${items.length} rows from table`
        };
    }
    /**
     * Extracts repeating card, search result, or list item structures.
     */
    static extractCardRepeaters(container, schema, limit = 50) {
        // Look for common repeater parents
        const candidateParents = Array.from(container.querySelectorAll('ul, ol, [role="list"], [role="feed"], main, section, .results, .grid, .list'));
        // Also include the container itself if it's an element (not a Document)
        if (container && container.tagName && container.tagName !== 'DOCUMENT') {
            candidateParents.unshift(container);
        }
        let bestGroup = [];
        for (const parent of candidateParents) {
            const children = Array.from(parent.children);
            if (children.length < 2)
                continue;
            // Group children by tagName and class similarity
            const classGroups = new Map();
            for (const child of children) {
                // Ignore script, style, hidden
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(child.tagName))
                    continue;
                if (child.offsetWidth === 0 && child.offsetHeight === 0 && child.style?.display === 'none')
                    continue;
                const key = `${child.tagName}.${(child.className || '').trim().split(/\s+/)[0] || 'none'}`;
                if (!classGroups.has(key))
                    classGroups.set(key, []);
                classGroups.get(key).push(child);
            }
            for (const group of classGroups.values()) {
                if (group.length > bestGroup.length && group.length >= 2) {
                    bestGroup = group;
                }
            }
        }
        // Direct search for repeating articles, listitems, or cards if no parent group was clear
        if (bestGroup.length < 2) {
            const articles = Array.from(container.querySelectorAll('article, [role="article"], [role="listitem"], .card, .item'));
            if (articles.length >= 2) {
                bestGroup = articles;
            }
        }
        if (bestGroup.length < 2)
            return null;
        const items = [];
        for (const card of bestGroup) {
            if (items.length >= limit)
                break;
            const record = {};
            if (schema && schema.fields && Object.keys(schema.fields).length > 0) {
                // Schema-guided field extraction
                for (const [field, fieldType] of Object.entries(schema.fields)) {
                    record[field] = this.extractFieldBySchema(card, field, fieldType);
                }
            }
            else {
                // Heuristic field extraction
                // 1. Title / Header
                const titleEl = card.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"], strong, b, a.title, .title');
                if (titleEl) {
                    record['title'] = scrubText(this.cleanText(titleEl.textContent || ''));
                }
                // 2. Link / URL
                const linkEl = (card.tagName === 'A' ? card : card.querySelector('a[href]'));
                if (linkEl && linkEl.href) {
                    record['url'] = linkEl.href;
                    if (!record['title'] && linkEl.textContent) {
                        record['title'] = scrubText(this.cleanText(linkEl.textContent));
                    }
                }
                // 3. Description / Snippet
                const descEl = card.querySelector('p, .description, .summary, .snippet, .desc');
                if (descEl) {
                    record['description'] = scrubText(this.cleanText(descEl.textContent || ''));
                }
                // 4. Badge / Tag / Metadata
                const badgeEl = card.querySelector('.badge, .tag, .label, .category, span[class*="badge"], span[class*="tag"]');
                if (badgeEl) {
                    record['tag'] = scrubText(this.cleanText(badgeEl.textContent || ''));
                }
                // 5. Price / Currency / Number detection
                const allText = card.textContent || '';
                const priceMatch = allText.match(/(?:[$€£₹]|USD|INR|EUR)\s*\d+(?:[.,]\d+)?/i);
                if (priceMatch) {
                    record['price'] = priceMatch[0].trim();
                }
                // If nothing specific matched, capture clean card text
                if (Object.keys(record).length === 0) {
                    const fallback = scrubText(this.cleanText(allText));
                    if (fallback)
                        record['content'] = fallback;
                }
            }
            if (Object.keys(record).length > 0) {
                items.push(record);
            }
        }
        if (items.length === 0)
            return null;
        const markdown = this.recordsToMarkdown(items);
        return {
            success: true,
            count: items.length,
            items,
            markdown,
            summary: `Extracted ${items.length} cards/items`
        };
    }
    /**
     * Schema-guided extractor for an individual card element.
     */
    static extractFieldBySchema(el, fieldName, fieldType) {
        const normalizedName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (fieldType === 'link') {
            const linkEl = (el.tagName === 'A' ? el : el.querySelector(`a[href*="${normalizedName}"], a.${normalizedName}, a[href]`));
            return linkEl?.href || '';
        }
        if (fieldType === 'image') {
            const imgEl = el.querySelector(`img[src*="${normalizedName}"], img.${normalizedName}, img`);
            return imgEl?.src || '';
        }
        // Try matching specific selector by class or attribute
        const matchedEl = el.querySelector(`.${normalizedName}, [data-field="${fieldName}"], [itemprop="${fieldName}"], .${fieldName}`);
        const targetText = matchedEl ? matchedEl.textContent : el.textContent;
        const cleaned = scrubText(this.cleanText(targetText || ''));
        if (fieldType === 'number') {
            const numMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
            return numMatch ? parseFloat(numMatch[1]) : 0;
        }
        return cleaned;
    }
    /**
     * Generic key-value fallback when no repeating lists or tables are detected.
     */
    static extractGenericKeyValue(container, limit = 50) {
        const dlElements = Array.from(container.querySelectorAll('dl'));
        const items = [];
        if (dlElements.length > 0) {
            for (const dl of dlElements) {
                const dts = Array.from(dl.querySelectorAll('dt'));
                const dds = Array.from(dl.querySelectorAll('dd'));
                const record = {};
                dts.forEach((dt, idx) => {
                    const key = this.cleanText(dt.textContent || `key_${idx}`);
                    const val = scrubText(this.cleanText(dds[idx]?.textContent || ''));
                    if (key && val)
                        record[key] = val;
                });
                if (Object.keys(record).length > 0)
                    items.push(record);
            }
        }
        // Fallback to top visible headings and paragraphs
        if (items.length === 0) {
            const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4'));
            for (const h of headings.slice(0, limit)) {
                const title = scrubText(this.cleanText(h.textContent || ''));
                const nextP = h.nextElementSibling?.tagName === 'P' ? h.nextElementSibling : null;
                const text = nextP ? scrubText(this.cleanText(nextP.textContent || '')) : '';
                if (title) {
                    items.push({ section: title, detail: text });
                }
            }
        }
        const markdown = this.recordsToMarkdown(items);
        return {
            success: items.length > 0,
            count: items.length,
            items,
            markdown,
            summary: items.length > 0 ? `Extracted ${items.length} structural elements` : 'No structured data detected'
        };
    }
    /**
     * Transforms structured records into a clean GitHub Flavored Markdown table.
     */
    static recordsToMarkdown(items, explicitHeaders) {
        if (!items || items.length === 0)
            return '';
        const keySet = new Set();
        for (const item of items) {
            for (const k of Object.keys(item)) {
                keySet.add(k);
            }
        }
        const headers = explicitHeaders && explicitHeaders.length > 0
            ? explicitHeaders
            : Array.from(keySet.values());
        if (headers.length === 0)
            return '';
        const lines = [];
        // Header line
        lines.push(`| ${headers.join(' | ')} |`);
        // Separator line
        lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
        // Data rows
        for (const item of items) {
            const row = headers.map((h) => {
                const val = item[h];
                if (val === undefined || val === null)
                    return '';
                const str = String(val).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
                return str;
            });
            lines.push(`| ${row.join(' | ')} |`);
        }
        return lines.join('\n');
    }
    static cleanText(text) {
        return text.replace(/\s+/g, ' ').trim();
    }
    static coerceValue(text, expectedType) {
        if (expectedType === 'number') {
            const num = parseFloat(text.replace(/[^0-9.-]/g, ''));
            return isNaN(num) ? text : num;
        }
        return text;
    }
}
//# sourceMappingURL=table-extractor.js.map