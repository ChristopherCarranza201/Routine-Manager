// types/react-big-calendar-dnd.d.ts
declare module "react-big-calendar/lib/addons/dragAndDrop" {
    import * as React from "react";
    import { CalendarProps } from "react-big-calendar";

    export default function withDragAndDrop<
        TEvent extends object = any,
        TResource extends object = any
    >(
        component: React.ComponentType<CalendarProps<TEvent, TResource>>
    ): React.ComponentType<
        CalendarProps<TEvent, TResource> & {
            resizable?: boolean;
            onEventDrop?: (args: {
                event: TEvent;
                start: Date;
                end: Date;
                isAllDay?: boolean;
                resourceId?: string | number;
            }) => void;
            onEventResize?: (args: {
                event: TEvent;
                start: Date;
                end: Date;
                isAllDay?: boolean;
            }) => void;
            draggableAccessor?: ((event: TEvent) => boolean) | keyof TEvent;
        }
    >;
}
