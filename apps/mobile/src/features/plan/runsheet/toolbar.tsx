import { PlanToolbar } from "../plan-toolbar";

export const RunSheetToolbar = ({
  toolbar,
  canReorder,
  reordering,
  onReorder,
}: {
  toolbar: Parameters<typeof PlanToolbar>[0];
  /** Reorder needs edit access and at least two items. */
  canReorder: boolean;
  reordering: boolean;
  onReorder: () => void;
}) => {
  const { onStep, onOpenPlanningCenter } = toolbar;
  return (
    <PlanToolbar
      {...toolbar}
      rightItems={() => [
        {
          type: "button",
          label: "Previous plan",
          icon: { type: "sfSymbol", name: "chevron.up" },
          width: 37,
          sharesBackground: true,
          onPress: () => {
            onStep("previous");
          },
        },
        {
          type: "menu",
          label: "More",
          icon: { type: "sfSymbol", name: "ellipsis" },
          width: 37,
          sharesBackground: true,
          menu: {
            items: [
              {
                type: "action",
                label: "Next plan",
                onPress: () => {
                  onStep("next");
                },
              },
              ...(canReorder
                ? [
                    {
                      type: "action" as const,
                      label: reordering ? "Done Reordering" : "Reorder",
                      onPress: () => {
                        onReorder();
                      },
                    },
                  ]
                : []),
              ...(onOpenPlanningCenter === undefined
                ? []
                : [
                    {
                      type: "action" as const,
                      label: "Open in Planning Center",
                      onPress: onOpenPlanningCenter,
                    },
                  ]),
            ],
          },
        },
      ]}
    />
  );
};
