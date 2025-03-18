import { useEffect } from "react";
import { AutocompleteElement } from "react-hook-form-mui";
import { useSelector } from "react-redux";
import { queryDfTags } from "../../store/df-tags/df-tags.action.ts";
import { selectDfTagNames } from "../../store/df-tags/df-tags.selector.ts";
import { store } from "../../store/store.ts";

export type DfTagFieldProps = {
    name: string;
    label: string;
};
export const DfTagField = ({name, label}: DfTagFieldProps) => {
    useEffect(() => {
        store.dispatch(queryDfTags.start());
    }, []);
    const availableTags = useSelector(selectDfTagNames);
    return <AutocompleteElement name={name} label={label} options={availableTags} multiple={true} autocompleteProps={
        {
            isOptionEqualToValue: (option, value) => option === value,
        }
    } />
}