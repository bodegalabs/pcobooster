import { queryKeys } from "@pcobooster/client/query-keys";
import { hasServicesLevel } from "@pcobooster/planning-center-models/access";
import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import {
  Action,
  Card,
  Choice,
  Editor,
  Field,
  Label,
  ReadState,
  Row,
  Screen,
} from "../components/ui";
import { useAccount, useRpcMutation, useRpcQuery } from "../runtime";
import { tabRouter as router } from "../tab-router";

export const SongsScreen = () => {
  const account = useAccount();
  const library = useRpcQuery(
    "songs.library",
    {},
    queryKeys.songLibrary(),
    account.features.data?.chordCharts === true
  );
  const [unusedBefore, setUnusedBefore] = useState(
    () => Date.now() - 365 * 24 * 60 * 60_000
  );
  useEffect(() => {
    const timer = setInterval(() => {
      setUnusedBefore(Date.now() - 365 * 24 * 60 * 60_000);
    }, 60 * 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("Title");
  const [filter, setFilter] = useState("All songs");
  const [add, setAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [ccli, setCcli] = useState("");
  const create = useRpcMutation("chordCharts.createSong");
  const songs =
    library.data?.songs
      .filter(
        (song) =>
          `${song.title} ${song.author}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (filter === "All songs" ||
            !song.lastScheduledAt ||
            song.lastScheduledAt.getTime() < unusedBefore)
      )
      .toSorted((left, right) =>
        sort === "Title"
          ? left.title.localeCompare(right.title)
          : (right.lastScheduledAt?.getTime() ?? 0) -
            (left.lastScheduledAt?.getTime() ?? 0)
      ) ?? [];
  const canEdit =
    !account.readOnly &&
    account.access.data?.services.status === "granted" &&
    (account.access.data.services.organizationAdministrator ||
      hasServicesLevel(account.access.data.services.songLevel, "Editor"));
  return (
    <Screen
      title="Songs"
      refresh={() => {
        void library.refetch();
      }}
      fetching={library.isRefetching}
    >
      <Field label="Search library" value={search} onChangeText={setSearch} />
      <Choice
        values={["All songs", "Unused 1+ year"]}
        value={filter}
        onChange={setFilter}
      />
      <Choice values={["Title", "Last sung"]} value={sort} onChange={setSort} />
      <ReadState query={library}>
        <Label secondary>
          {songs.length} songs
          {library.data?.truncated === true
            ? ", this library is incomplete"
            : ""}
        </Label>
        {songs.map((song) => (
          <Card key={song.id}>
            <Row
              title={song.title}
              detail={`${song.author}${song.lastScheduledAt ? `, last sung ${formatCalendarDateLabel(song.lastScheduledAt, account.timeZone, "weekdayMonthDay")}` : ", never scheduled"}`}
              onPress={() => {
                router.push(`/songs/${song.id}`);
              }}
            />
            <Action
              label={`Chord chart for ${song.title}`}
              onPress={() => {
                router.push(`/songs/${song.id}/chart`);
              }}
            />
          </Card>
        ))}
      </ReadState>
      {canEdit ? (
        <Action
          label="Add song"
          onPress={() => {
            setAdd(true);
          }}
        />
      ) : null}
      <Editor
        label="Add song"
        visible={add}
        onClose={() => {
          setAdd(false);
        }}
        busy={create.isPending}
      >
        <Field
          label="Title or CCLI song"
          value={title}
          onChangeText={setTitle}
        />
        <Field label="Author" value={author} onChangeText={setAuthor} />
        <Field
          label="CCLI number, optional"
          value={ccli}
          onChangeText={setCcli}
          keyboardType="number-pad"
        />
        {title ? (
          <Card title="Already in Planning Center">
            {library.data?.songs.flatMap((song) =>
              song.title.toLowerCase().includes(title.toLowerCase())
                ? [
                    <Row
                      key={song.id}
                      title={song.title}
                      onPress={() => {
                        setAdd(false);
                        router.push(`/songs/${song.id}`);
                      }}
                    />,
                  ]
                : []
            )}
          </Card>
        ) : null}
        <Action
          label="Add to Planning Center"
          disabled={!title.trim() || create.isPending}
          onPress={() => {
            create.mutate(
              { title, author, ccliNumber: ccli ? Number(ccli) : undefined },
              {
                onSuccess: (song) => {
                  setAdd(false);
                  router.push(`/songs/${song.song.id}/chart`);
                },
              }
            );
          }}
        />
      </Editor>
    </Screen>
  );
};
export const SongScreen = () => {
  const { songId } = useLocalSearchParams<{ songId: string }>();
  const account = useAccount();
  const history = useRpcQuery(
    "songs.history",
    { songId },
    queryKeys.songHistory(songId)
  );
  const chart = useRpcQuery(
    "chordCharts.song",
    { songId },
    queryKeys.chordChartSong(songId),
    account.features.data?.chordCharts === true
  );
  const services = useRpcQuery(
    "catalog.serviceTypes",
    {},
    queryKeys.serviceTypes()
  );
  const [serviceTypeId, setServiceTypeId] = useState<string | null>(null);
  const selected = serviceTypeId ?? services.data?.[0]?.id ?? "";
  const options = useRpcQuery(
    "songs.options",
    { songId, serviceTypeId: selected },
    queryKeys.songOptions(songId, selected),
    !!selected
  );
  return (
    <Screen
      title={chart.data?.song.title ?? options.data?.song.title ?? "Song"}
      refresh={() => {
        void history.refetch();
        void chart.refetch();
        void options.refetch();
      }}
      fetching={chart.isRefetching}
    >
      <Label secondary>
        {chart.data?.song.author ?? options.data?.song.author}
      </Label>
      {account.features.data?.chordCharts === true ? (
        <Action
          label="Chord chart"
          onPress={() => {
            router.push(`/songs/${songId}/chart`);
          }}
        />
      ) : null}
      <Card title="Service type">
        {services.data?.map((service) => (
          <Action
            key={service.id}
            label={service.name}
            selected={service.id === selected}
            onPress={() => {
              setServiceTypeId(service.id);
            }}
          />
        ))}
      </Card>
      <Card title="Arrangements">
        <ReadState query={options}>
          {options.data?.arrangements.map((arrangement) => (
            <Row
              key={arrangement.id}
              title={arrangement.name}
              detail={[
                arrangement.bpm === null ? "" : `${arrangement.bpm} BPM`,
                arrangement.meter,
                arrangement.keys.map((key) => key.name).join(", "),
              ]
                .filter(Boolean)
                .join(" • ")}
              onPress={
                account.features.data?.chordCharts === true
                  ? () => {
                      router.push({
                        pathname: "/songs/[songId]/chart",
                        params: { songId, arrangementId: arrangement.id },
                      });
                    }
                  : undefined
              }
            />
          ))}
        </ReadState>
      </Card>
      <Card title="Last sung">
        <ReadState query={history}>
          {history.data?.length === 0 ? (
            <Label secondary>No services in the last year.</Label>
          ) : null}
          {history.data?.map((entry) => (
            <Row
              key={`${entry.serviceTypeId}.${entry.planId}.${entry.sortDate.toISOString()}.${entry.arrangementName}.${entry.keyName}`}
              title={formatCalendarDateLabel(
                entry.sortDate,
                account.timeZone,
                "weekdayMonthDay"
              )}
              detail={[
                entry.serviceTypeName,
                entry.arrangementName,
                entry.keyName,
              ]
                .filter(Boolean)
                .join(", ")}
              onPress={
                entry.planId !== null && entry.serviceTypeId !== null
                  ? () => {
                      router.push(
                        `/services/${entry.serviceTypeId}/plans/${entry.planId}`
                      );
                    }
                  : undefined
              }
            />
          ))}
        </ReadState>
      </Card>
    </Screen>
  );
};
