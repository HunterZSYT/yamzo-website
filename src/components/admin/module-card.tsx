import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AdminModuleCard({
  id,
  icon: Icon,
  title,
  description,
  status,
  metric,
  details,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  status: string;
  metric?: string;
  details: string[];
}) {
  return (
    <Card
      id={id}
      className="scroll-mt-32 rounded-2xl bg-white shadow-sm"
      aria-labelledby={`${id}-title`}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-muted text-primary">
            <Icon aria-hidden="true" className="size-4.5" />
          </span>
          <Badge variant="outline">{status}</Badge>
        </div>
        <CardTitle id={`${id}-title`} className="mt-3 text-lg font-bold">
          {title}
        </CardTitle>
        <CardDescription className="min-h-10 leading-5">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {metric ? (
          <p className="mb-4 text-2xl font-extrabold tracking-[-0.04em]">
            {metric}
          </p>
        ) : null}
        <ul className="grid gap-2 text-xs leading-5 text-muted-foreground">
          {details.map((detail) => (
            <li key={detail} className="flex gap-2">
              <span
                aria-hidden="true"
                className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary/65"
              />
              {detail}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button disabled variant="outline" className="min-h-10 w-full">
          Open {title.toLowerCase()}
        </Button>
      </CardFooter>
    </Card>
  );
}
