import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box, Card, IconButton, List, MenuItem, Select, SelectChangeEvent, Stack, Tooltip, Typography } from "@mui/material";
import { Controller, useFormContext } from "react-hook-form";
import { FormLabelInline } from "./form-label-inline";
import DeleteIcon from "@mui/icons-material/Delete";
import React from "react";

type PossibleValueType<VALUE_TYPE extends string> = VALUE_TYPE | {
  value: VALUE_TYPE;
  description: string;
}
const getValueValue = <VALUE_TYPE extends string>(value: PossibleValueType<VALUE_TYPE>): VALUE_TYPE => typeof value === "string" ? value : value.value;

type OrdereableListFormFieldProps<VALUE_TYPE extends string = string> = {
  name: string;
  label: string;
  possibleValues?: Array<PossibleValueType<VALUE_TYPE>>;
  minSize?: number;
  description?: string | React.ReactNode;
  nonDraggableValues?: Array<VALUE_TYPE>;
  transformListOrder?: (previousValues: VALUE_TYPE[], newValues: VALUE_TYPE[]) => VALUE_TYPE[];
}

interface OrderableListProps<VALUE_TYPE extends string> {
  onChange: (value: VALUE_TYPE[]) => void;
  possibleValues?: Array<VALUE_TYPE>;
  descriptionMap: Map<string, string | undefined>;
  nonDraggableValues?: Array<VALUE_TYPE>;
  minSize?: number;
  values: Array<VALUE_TYPE>;
  name: string;
}

export const OrderableListFormField = <VALUE_TYPE extends string>({ name, label, possibleValues, description, nonDraggableValues, transformListOrder, minSize }: OrdereableListFormFieldProps<VALUE_TYPE>) => {
  const { control } = useFormContext();
  const descriptionMap = new Map<string, string | undefined>();
  if (possibleValues) {
    possibleValues.forEach((value) => {
      const valueDescription = typeof value === "string" ? undefined : value.description;
      descriptionMap.set(getValueValue(value), valueDescription);
    });
  }
  const [ currentValues, setCurrentValues ] = React.useState<VALUE_TYPE[]>(control._formValues[name] || [])
  const possibleValuesValues = possibleValues ? possibleValues.map((value) => getValueValue(value)) : undefined;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => {
        const onChangeActual = (newValue: VALUE_TYPE[]) => {
          const newValueTransformed = transformListOrder ? transformListOrder(currentValues, newValue) : newValue;
          setCurrentValues(newValueTransformed);
          onChange(newValueTransformed);
        }
        return (
          <Box
            sx={{
              border: 1,
              borderRadius: 1,
              borderColor: `rgba(255, 255, 255, 0.23)`,
              padding: 1,
            }}
          >
            <FormLabelInline>{label}</FormLabelInline>
            {description && typeof description === 'string' ? <Typography variant="caption">{description}</Typography> : description}
            <OrderableList name={name} possibleValues={possibleValuesValues} descriptionMap={descriptionMap} values={value} onChange={onChangeActual} nonDraggableValues={nonDraggableValues} minSize={minSize} />
          </Box>
        );
      }}
    />
  );
};

interface ListItem<VALUE_TYPE extends string> {
  id: string;
  label: VALUE_TYPE;
}
export const OrderableList = <VALUE_TYPE extends string>({ name, possibleValues, values, onChange, nonDraggableValues, minSize, descriptionMap }: OrderableListProps<VALUE_TYPE>) => {
  const nonDraggable = new Set(nonDraggableValues || []);
  const items: ListItem<VALUE_TYPE>[] = values.map((value) => ({
    id: `${name}-${value}`,
    label: value,
  }));
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (active.id !== over?.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over?.id);
      const newOrder = arrayMove(items, oldIndex, newIndex);
      onChange(newOrder.map((item) => item.label));
    }
  };
  const removeDisabled = items.length <= (minSize || 0);
  const handleItemRemoved = (id: string) => {
    if (removeDisabled) {
      return;
    }
    const newItems = items.filter((item) => item.id !== id);
    onChange(newItems.map((item) => item.label));
  }
  const itemSelected = (event: SelectChangeEvent<string>) => {
    const value = event.target.value as VALUE_TYPE;
    onChange([...values, value]);
  }
  const itemsNotInList = (possibleValues || []).filter((value) => !items.map((item) => item.label).includes(getValueValue(value)));
  return (
    <Stack sx={{ padding: 2 }}>
      {possibleValues && <Select disabled={itemsNotInList.length === 0}
        onChange={itemSelected} displayEmpty
        renderValue={() => itemsNotInList.length === 0 ? "No more items to add" : "Add Item"}>
        {itemsNotInList.map((value) => <MenuItem value={value}>{value}</MenuItem>)}
      </Select>}
      <DndContext onDragEnd={handleDragEnd}>
        <List>
          {items.map((value) => (
            <OrderedListItem id={value.id} label={value.label} description={descriptionMap.get(value.label)}
              onRemove={possibleValues ? () => handleItemRemoved(value.id) : undefined}
              removeDisabled={removeDisabled} draggable={!nonDraggable.has(value.label)}
              />
          ))}
        </List>
      </DndContext>
    </Stack>
  );
};

interface OrderedListItemProps {
  id: string;
  label: string;
  description?: string;
  draggable?: boolean;
  onRemove?: (id: string) => void;
  removeDisabled?: boolean;
}

const OrderedListItem = ({ id, label, onRemove, removeDisabled, description, draggable = true }: OrderedListItemProps) => {
  const { setNodeRef: droppableSetNodeRef } = useDroppable({ id });
  const {
    attributes,
    listeners,
    setNodeRef: draggableSetNodeRef,
    transform,
  } = useDraggable({
    id,
  });
  const style = transform
    ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(1.01)`,
    }
    : {};
  const textValue = <Typography>{label}</Typography>;
  return (
    <Card ref={droppableSetNodeRef} sx={{ ...style, marginY: 0.5, touchAction: "none" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", paddingX: 1, alignItems: "center" }}>
        {description ? <Tooltip title={description}>{textValue}</Tooltip> : textValue}
        <Box sx={{ display: "flex", alignItems: "center" }}>
          {onRemove && <IconButton onClick={() => onRemove(id)} disabled={removeDisabled}><DeleteIcon /></IconButton>}
          <IconButton ref={draggableSetNodeRef} {...listeners} {...attributes} disabled={!draggable}>
            <DragIndicatorIcon />
          </IconButton>
        </Box>
      </Box>
    </Card>
  );
};
