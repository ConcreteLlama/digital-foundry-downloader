import { useEffect, useState } from "react";

type QueryParams<T> = {
    fetch: () => Promise<T>;
    triggerOnMount?: boolean;
}
export const useQuery = <T>({ fetch, triggerOnMount }: QueryParams<T>) => {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [refetchIdx, setRefetchIdx] = useState<number>(0);
    const [ queriesPerformed, setQueriesPerformed ] = useState<number>(0);
    const [triggerFetch, setTriggerFetch] = useState<boolean>(triggerOnMount === undefined ? true : triggerOnMount);
    const refetch = () => {
        setTriggerFetch(true);
        setRefetchIdx(refetchIdx + 1);
    }
    useEffect(() => {
        if (triggerFetch) {
            setLoading(true);
            setError(null);
            setData(null);
            setQueriesPerformed(queriesPerformed + 1);
            fetch()
                .then(data => {
                    setData(data);
                    setLoading(false);
                }).catch(err => {
                    setError(err.message);
                    setLoading(false);
                });
        }
    }, [refetchIdx]);
    return { data, loading, error, refetch, queriesPerformed };
}