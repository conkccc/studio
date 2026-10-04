'use client';
import type React from 'react';
import type { Meeting } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface SelectDateProps {
  isEditMode: boolean;
  isPending: boolean;
  initialData?: Meeting;
  timeValue?: Date;
  checkStartTimeValue?: Date;
  varName: string;
  titleNode: React.ReactNode;
  openState: boolean;
  openStateFunc: (state: boolean) => void;
  onDateChanged: (date: Date | undefined) => void;
}
export function SelectDate(props: SelectDateProps) {
  return (
    <div>
        <Label htmlFor={props.varName} className={cn((props.isEditMode && props.initialData?.isSettled) && "text-muted-foreground")}>{props.titleNode}</Label>
        <Popover open={props.openState} onOpenChange={props.openStateFunc}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              id={props.varName}
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !props.timeValue && 'text-muted-foreground',
                (props.isEditMode && props.initialData?.isSettled) && "bg-muted/50 cursor-not-allowed"
              )}
              disabled={props.isPending || (props.isEditMode && props.initialData?.isSettled)}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {
                (() => {
                  const val = props.timeValue;
                  return val instanceof Date && !isNaN(val.getTime())
                    ? format(val, 'PPP HH:mm', { locale: ko })
                    : <span>날짜 및 시간 선택</span>;
                })()
              }
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className="w-auto max-w-[calc(100vw-2rem)] max-h-[min(var(--radix-popover-content-available-height),calc(100vh-2rem))] overflow-auto p-0"
          >
            <Calendar
              mode="single"
              selected={props.timeValue}
              onSelect={(date) => {
                if (date) {
                  const currentTime = props.timeValue || props.checkStartTimeValue || (() => { const t = new Date(); t.setHours(11, 0, 0, 0); return t; })();
                  const newDateTime = new Date(date);
                  newDateTime.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0);
                  props.onDateChanged(newDateTime);
                } else if (props.checkStartTimeValue) {
                  props.onDateChanged(undefined);
                }
              }}
              initialFocus
              disabled={props.isPending || (props.isEditMode && props.initialData?.isSettled)}
              fromDate={props.checkStartTimeValue ? new Date(props.checkStartTimeValue) : undefined}
            />
            <div className="p-3 border-t border-border space-y-2">
              <Label htmlFor={`${props.varName}-time`}>시간</Label>
              <Input
                type="time"
                id={`${props.varName}-time`}
                defaultValue={props.timeValue ? format(props.timeValue, "HH:mm") : (props.checkStartTimeValue ? format(props.checkStartTimeValue, "HH:mm") : "11:00")}
                onChange={(e) => {
                  const newTime = e.target.value;
                  const currentDateTime = props.timeValue || new Date();
                  const [hours, minutes] = newTime.split(':').map(Number);
                  const newDate = new Date(currentDateTime);
                  newDate.setHours(hours, minutes, 0, 0);
                  props.onDateChanged(newDate);
                }}
                className="w-full"
                disabled={props.isPending || (props.isEditMode && props.initialData?.isSettled)}
              />
              <Button size="sm" onClick={() => props.openStateFunc(false)} className="w-full" type="button" disabled={(props.isEditMode && props.initialData?.isSettled)}>확인</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
  );
}
