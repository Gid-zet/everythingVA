"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Calendar, Clock, MapPin, Users, Repeat } from "lucide-react";
import type { RecurrenceRule } from "@/lib/recurrence";

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendars: any[];
  selectedDate: Date;
  onEventCreated: () => void;
}

export function CreateEventDialog({
  open,
  onOpenChange,
  calendars,
  selectedDate,
  onEventCreated,
}: CreateEventDialogProps) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    location: "",
    startTime: selectedDate.toISOString().slice(0, 16),
    endTime: new Date(selectedDate.getTime() + 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16),
    isAllDay: false,
    calendarId: "",
    attendees: "",
    isRecurring: false,
    recurrenceFrequency: "DAILY" as RecurrenceRule["frequency"],
    recurrenceInterval: 1,
    recurrenceWeekdays: [] as number[],
    recurrenceEndType: "never" as "never" | "date" | "count",
    recurrenceEndDate: "",
    recurrenceCount: 10,
  });

  const createDbEventMutation = api.calendar.createDbEvent.useMutation({
    onSuccess: () => {
      toast.success("Event created successfully");
      // Reset form first
      setFormData({
        title: "",
        description: "",
        location: "",
        startTime: selectedDate.toISOString().slice(0, 16),
        endTime: new Date(selectedDate.getTime() + 60 * 60 * 1000)
          .toISOString()
          .slice(0, 16),
        isAllDay: false,
        calendarId: "",
        attendees: "",
        isRecurring: false,
        recurrenceFrequency: "DAILY",
        recurrenceInterval: 1,
        recurrenceWeekdays: [],
        recurrenceEndType: "never",
        recurrenceEndDate: "",
        recurrenceCount: 10,
      });
      // Then trigger refresh and close
      onEventCreated();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to create event: ${error.message}`);
      console.error("Create event error:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.calendarId) {
      toast.error("Please fill in all required fields");
      return;
    }

    const selectedCalendar = calendars.find(
      (cal) => cal.id === formData.calendarId,
    );
    if (!selectedCalendar) {
      toast.error("Please select a calendar");
      return;
    }

    // Build recurrence rule if recurring
    let recurrence: RecurrenceRule | null = null;
    if (formData.isRecurring) {
      recurrence = {
        frequency: formData.recurrenceFrequency,
        interval: formData.recurrenceInterval,
        byWeekday: formData.recurrenceWeekdays.length > 0 ? formData.recurrenceWeekdays : undefined,
      };

      if (formData.recurrenceEndType === "date" && formData.recurrenceEndDate) {
        recurrence.endDate = new Date(formData.recurrenceEndDate);
      } else if (formData.recurrenceEndType === "count") {
        recurrence.count = formData.recurrenceCount;
      }
    }

    createDbEventMutation.mutate({
      calendarId: formData.calendarId,
      title: formData.title,
      description: formData.description || undefined,
      location: formData.location || undefined,
      startTime: new Date(formData.startTime).toISOString(),
      endTime: new Date(formData.endTime).toISOString(),
      isAllDay: formData.isAllDay,
      recurrence: recurrence || undefined,
    });
  };

  const handleInputChange = (field: string, value: string | boolean | number | number[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Create New Event
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Event Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              placeholder="Enter event title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              placeholder="Enter event description"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleInputChange("location", e.target.value)}
                placeholder="Enter location"
                className="pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time *</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="startTime"
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) =>
                    handleInputChange("startTime", e.target.value)
                  }
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endTime">End Time *</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="endTime"
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => handleInputChange("endTime", e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar">Calendar *</Label>
            <Select
              value={formData.calendarId}
              onValueChange={(value) => handleInputChange("calendarId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a calendar" />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((calendar) => (
                  <SelectItem key={calendar.id} value={calendar.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: calendar.color || "#3b82f6" }}
                      />
                      {calendar.name} ({calendar.account.emailAddress})
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="attendees">Attendees</Label>
            <div className="relative">
              <Users className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="attendees"
                value={formData.attendees}
                onChange={(e) => handleInputChange("attendees", e.target.value)}
                placeholder="email1@example.com, email2@example.com"
                className="pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Separate multiple email addresses with commas
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isAllDay"
              checked={formData.isAllDay}
              onCheckedChange={(checked) => handleInputChange("isAllDay", checked === true)}
            />
            <Label htmlFor="isAllDay" className="cursor-pointer">All-day event</Label>
          </div>

          {/* Recurrence Options */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isRecurring"
                checked={formData.isRecurring}
                onCheckedChange={(checked) => handleInputChange("isRecurring", checked === true)}
              />
              <Label htmlFor="isRecurring" className="cursor-pointer flex items-center gap-2">
                <Repeat className="h-4 w-4" />
                Repeat event
              </Label>
            </div>

            {formData.isRecurring && (
              <div className="space-y-4 pl-6 border-l-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recurrenceFrequency">Frequency</Label>
                    <Select
                      value={formData.recurrenceFrequency}
                      onValueChange={(value) => handleInputChange("recurrenceFrequency", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DAILY">Daily</SelectItem>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="YEARLY">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recurrenceInterval">Repeat every</Label>
                    <Input
                      id="recurrenceInterval"
                      type="number"
                      min="1"
                      value={formData.recurrenceInterval}
                      onChange={(e) => handleInputChange("recurrenceInterval", parseInt(e.target.value) || 1)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.recurrenceFrequency === "DAILY" && "days"}
                      {formData.recurrenceFrequency === "WEEKLY" && "weeks"}
                      {formData.recurrenceFrequency === "MONTHLY" && "months"}
                      {formData.recurrenceFrequency === "YEARLY" && "years"}
                    </p>
                  </div>
                </div>

                {formData.recurrenceFrequency === "WEEKLY" && (
                  <div className="space-y-2">
                    <Label>Repeat on</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 0, label: "Sun" },
                        { value: 1, label: "Mon" },
                        { value: 2, label: "Tue" },
                        { value: 3, label: "Wed" },
                        { value: 4, label: "Thu" },
                        { value: 5, label: "Fri" },
                        { value: 6, label: "Sat" },
                      ].map((day) => (
                        <Button
                          key={day.value}
                          type="button"
                          variant={formData.recurrenceWeekdays.includes(day.value) ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const weekdays = formData.recurrenceWeekdays.includes(day.value)
                              ? formData.recurrenceWeekdays.filter((d) => d !== day.value)
                              : [...formData.recurrenceWeekdays, day.value];
                            handleInputChange("recurrenceWeekdays", weekdays);
                          }}
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Ends</Label>
                  <Select
                    value={formData.recurrenceEndType}
                    onValueChange={(value) => handleInputChange("recurrenceEndType", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never</SelectItem>
                      <SelectItem value="date">On date</SelectItem>
                      <SelectItem value="count">After</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.recurrenceEndType === "date" && (
                  <div className="space-y-2">
                    <Label htmlFor="recurrenceEndDate">End date</Label>
                    <Input
                      id="recurrenceEndDate"
                      type="date"
                      value={formData.recurrenceEndDate}
                      onChange={(e) => handleInputChange("recurrenceEndDate", e.target.value)}
                    />
                  </div>
                )}

                {formData.recurrenceEndType === "count" && (
                  <div className="space-y-2">
                    <Label htmlFor="recurrenceCount">Number of occurrences</Label>
                    <Input
                      id="recurrenceCount"
                      type="number"
                      min="1"
                      value={formData.recurrenceCount}
                      onChange={(e) => handleInputChange("recurrenceCount", parseInt(e.target.value) || 10)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createDbEventMutation.isPending}>
              {createDbEventMutation.isPending ? "Creating..." : "Create Event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
