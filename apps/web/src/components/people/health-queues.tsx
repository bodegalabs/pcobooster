import type { PeopleDashboardPerson } from "@pcobooster/contracts/people-schemas";
import { Clock3, ListChecks } from "lucide-react";

import { PersonLineSkeletonList } from "@/components/people/people-skeletons";
import {
  PersonAvatar,
  PersonRowButton,
} from "@/components/people/shared-components";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";

interface HealthQueuesProps {
  underused: PeopleDashboardPerson[];
  needsRest: PeopleDashboardPerson[];
  isLoading: boolean;
  getPersonIntentProps: GetIntentPrefetchProps<PeopleDashboardPerson>;
  onOpenPerson: (person: PeopleDashboardPerson) => void;
}

export const HealthQueues = ({
  underused,
  needsRest,
  isLoading,
  getPersonIntentProps,
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
        {isLoading ? <PersonLineSkeletonList rows={4} /> : null}
        {underused.length === 0 && !isLoading ? (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">
            No underused people in this sample.
          </p>
        ) : (
          underused.slice(0, 6).map((person) => (
            <PersonRowButton
              key={`queue-${person.id}`}
              person={person}
              getPersonIntentProps={getPersonIntentProps}
              onOpenPerson={onOpenPerson}
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
            </PersonRowButton>
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
        {isLoading ? (
          <PersonLineSkeletonList rows={3} showAvatar={false} />
        ) : null}
        {needsRest.length === 0 && !isLoading ? (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">
            No high-load people in this sample.
          </p>
        ) : (
          needsRest.slice(0, 3).map((person) => (
            <PersonRowButton
              key={`cadence-${person.id}`}
              person={person}
              getPersonIntentProps={getPersonIntentProps}
              onOpenPerson={onOpenPerson}
              className="justify-between"
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
            </PersonRowButton>
          ))
        )}
      </CardContent>
    </Card>
  </div>
);
