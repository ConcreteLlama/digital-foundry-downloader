import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box, Card, IconButton, List, Stack, Typography } from "@mui/material";
import { Controller, useFormContext } from "react-hook-form";
import { FormLabelInline } from "./form-label-inline";

interface OrdereableListFormFieldProps {
  extendable?: boolean;
  name: string;
  label: string;
}
interface OrderableListProps {
  onChange: (value: string[]) => void;
  possibleValues: Array<string>;
  name: string;
}

export const OrderableListFormField = ({ name, label }: OrdereableListFormFieldProps) => {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => {
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
            <OrderableList name={name} possibleValues={value} onChange={onChange} />
          </Box>
        );
      }}
    />
  );
};

interface ListItem {
  id: string;
  label: string;
}
export const OrderableList = ({ name, possibleValues, onChange }: OrderableListProps) => {
  const items: ListItem[] = possibleValues.map((value) => ({
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
  return (
    <Stack>
      <DndContext onDragEnd={handleDragEnd}>
        <List>
          {items.map((value) => (
            <OrderedListItem id={value.id} label={value.label} />
          ))}
        </List>
      </DndContext>
    </Stack>
  );
};

// Removed this functionality as unused; if I want to have extendable lists in the future I can create a wrapper that takes addItem and
// removeItem handlers as props and manages the state of the list.
// type AddItemFormProps = {
//   fieldName: string;
//   currentItems: ListItem[];
//   setItems: (items: ListItem[]) => void;
// };
// const AddItemForm = ({ currentItems, setItems, fieldName }: AddItemFormProps) => {
//   const [value, setValue] = useState<string>("");
//   return (
//     <FormControl>
//       <Box>
//         <TextField onChange={(event) => setValue(event.target.value)} size="small" placeholder="Add Custom Value" />
//         <Button onClick={() => setItems([...currentItems, { id: `${fieldName}-${value}`, label: value }])}>Add</Button>
//       </Box>
//     </FormControl>
//   );
// };

interface OrderedListItemProps {
  id: string;
  label: string;
}

const OrderedListItem = ({ id, label }: OrderedListItemProps) => {
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
  return (
    <Card ref={droppableSetNodeRef} sx={{ ...style, marginY: 0.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", paddingX: 1, alignItems: "center" }}>
        <Typography>{label}</Typography>
        <IconButton ref={draggableSetNodeRef} {...listeners} {...attributes}>
          <DragIndicatorIcon />
        </IconButton>
      </Box>
    </Card>
  );
};
