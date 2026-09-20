"use client";

import type { PeopleDashboardPerson } from "@worship-admin/contracts/people-schemas";
import { Clock3, ListChecks } from "lucide-react";

import { PersonAvatar } from "@/components/people/shared-components";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface HealthQueuesProps {
  underused: PeopleDashboardPerson[];
  needsRest: PeopleDashboardPerson[];
  isLoading: boolean;
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
  onOpenPerson: (person: PeopleDashboardPerson) => void;
}

export const HealthQueues = ({
  underused,
  needsRest,
  isLoading,
  onPreviewPerson,
  onOpenPerson,
}: HealthQueuesProps) => (
  <div className="grid gap-3 lg:grid-cols-2">
    <Card>
      <CardHeader>
        <CardTitle>
          <ListChecks className="text-muted-foreground size-4" />
          Rotation queue
        </CardTitle>
        <CardDescription>Good candidates to consider next.</CardDescription>
      </CardHeader>
      <CardContent>
        {underused.length === 0 && !isLoading ? (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">
            No underused people in this sample.
          </p>
        ) : (
          underused.slice(0, 6).map((person) => (
            <button
              key={`queue-${person.id}`}
              type="button"
              className="hover:bg-muted/50 flex items-center gap-3 rounded-md px-2 py-1.5 text-left"
              onFocus={() => {
                onPreviewPerson(person);
              }}
              onPointerEnter={() => {
                onPreviewPerson(person);
              }}
              onTouchStart={() => {
                onPreviewPerson(person);
              }}
              onClick={() => {
                onOpenPerson(person);
              }}
            >
              <PersonAvatar person={person} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {person.name}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {person.highlight}
                </span>
              </span>
            </button>
          ))
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>
          <Clock3 className="text-muted-foreground size-4" />
          Cadence watch
        </CardTitle>
        <CardDescription>
          People whose serving rhythm changed this month.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {needsRest.length === 0 && !isLoading ? (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">
            No high-load people in this sample.
          </p>
        ) : (
          needsRest.slice(0, 3).map((person) => (
            <button
              key={`cadence-${person.id}`}
              type="button"
              className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left"
              onFocus={() => {
                onPreviewPerson(person);
              }}
              onPointerEnter={() => {
                onPreviewPerson(person);
              }}
              onTouchStart={() => {
                onPreviewPerson(person);
              }}
              onClick={() => {
                onOpenPerson(person);
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {person.name}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {person.streak}
                </span>
              </span>
              <Badge variant="outline">{person.monthCount}</Badge>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  </div>
);
