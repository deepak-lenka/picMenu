import { Together } from "together-ai";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
const together = new Together();

export async function POST(request: Request) {
  const { menuUrl } = await request.json();

  console.log({ menuUrl });

  if (!menuUrl) {
    return Response.json({ error: "No menu URL provided" }, { status: 400 });
  }

  const systemPrompt = `You are given an image of a menu. Your job is to take each item in the menu and convert it into the following JSON format:

[{"name": "name of menu item", "price": "price in $", "description": "description of menu item"}, ...]

  Please make sure to include all items in the menu and include a price (if it exists) & a description (if it exists). ALSO PLEASE ONLY RETURN JSON. IT'S VERY IMPORTANT FOR MY JOB THAT YOU ONLY RETURN JSON.
  `;

  const output = await together.chat.completions.create({
    model: "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
    messages: [
      {
        role: "user",
        // @ts-expect-error api is not typed
        content: [
          { type: "text", text: systemPrompt },
          {
            type: "image_url",
            image_url: {
              url: menuUrl,
            },
          },
        ],
      },
    ],
  });

  const menuItems = output?.choices[0]?.message?.content;

  // Defining the schema we want our data in
  const menuSchema = z.array(
    z.object({
      name: z.string().describe("The name of the menu item"),
      price: z.string().describe("The price of the menu item"),
      description: z.string().describe("The description of the menu item"),
    })
  );
  const jsonSchema = zodToJsonSchema(menuSchema, "menuSchema");

  const extract = await together.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "The following is a list of items from a menu. Only answer in JSON.",
      },
      {
        role: "user",
        content: menuItems!,
      },
    ],
    model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    // @ts-expect-error - this is not typed in the API
    response_format: { type: "json_object", schema: jsonSchema },
  });

  let menuItemsJSON;
  if (extract?.choices?.[0]?.message?.content) {
    menuItemsJSON = JSON.parse(extract?.choices?.[0]?.message?.content);
    console.log({ menuItemsJSON });
  }

  for (const item of menuItemsJSON) {
    console.log("processed one image...");
    const response = await together.images.create({
      prompt: `${item.name} ${item.description}`,
      model: "black-forest-labs/FLUX.1-schnell",
      width: 1024,
      height: 768,
      steps: 3,
      // @ts-expect-error - this is not typed in the API
      response_format: "base64",
    });
    item.menuImage = response.data[0];
  }

  return Response.json({ menu: menuItemsJSON });
}

export const maxDuration = 45;