Here's a list of changes I want to make:

1. Find a better way to grab the zod schema for the payload of a command or event.
2. Find a better way to type a parameter that assumes the payload of a command in a projection. (right now I'm using `AggregateCommandPayload<typeof Aggregate, "CommandName">`, but it's kind of clunky and doesn't backlink to the command definition)
3. Find the type leak that plagues larger projects.
