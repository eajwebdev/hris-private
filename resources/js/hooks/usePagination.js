import { useEffect, useMemo, useState } from 'react';

/**
 * Client-side pagination for a fully-loaded array. Returns the current
 * page slice plus the meta the <Pagination> component expects.
 */
export function useClientPagination(items = [], perPage = 10) {
    const [page, setPage] = useState(1);
    const total = items.length;
    const lastPage = Math.max(1, Math.ceil(total / perPage));

    // Clamp back into range when the underlying list shrinks (filtering, deletes).
    useEffect(() => {
        if (page > lastPage) setPage(1);
    }, [lastPage, page]);

    const slice = useMemo(
        () => items.slice((page - 1) * perPage, page * perPage),
        [items, page, perPage]
    );

    return { page, setPage, lastPage, total, perPage, slice };
}

/**
 * Server-side pagination state. Any change to `resetKey` (e.g. active
 * filters) snaps back to page 1 so you never land on an empty page.
 */
export function useServerPagination(resetKey = '') {
    const [page, setPage] = useState(1);

    useEffect(() => {
        setPage(1);
    }, [resetKey]);

    return { page, setPage };
}
