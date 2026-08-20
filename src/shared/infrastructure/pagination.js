/**
 * Warns when a paginated collection response (X4 S3) didn't include every
 * row. Every list-fetching store requests the backend's max page size (200),
 * so this only fires once a business's data has actually outgrown that —
 * the point at which real UI pagination (page controls, lazy loading)
 * becomes worth building, instead of before it's ever needed.
 * @param {import('axios').AxiosResponse} response
 * @param {string} label - Human-readable name of the collection, for the log.
 */
export function warnIfTruncated(response, label) {
    const totalCount = response?.data?.totalCount;
    const items = response?.data?.items;
    if (typeof totalCount === 'number' && Array.isArray(items) && totalCount > items.length) {
        console.warn(
            `${label}: showing ${items.length} of ${totalCount} — this list has outgrown the page size, some rows are not displayed.`
        );
    }
}
