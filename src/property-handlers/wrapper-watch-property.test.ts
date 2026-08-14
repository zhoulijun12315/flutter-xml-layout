import { generateWidget, assertEqual } from '../test/shared';

suite("Wrapper Watch Property Tests", function () {
    test("basic", function() {
        const xml = `
<Column :watch="ctrl.a, IRAService.shared.b">
  <Text text="'hello'" />
</Column>
`;

        const expected = `
        MultiStreamBuilder(
          streams: [ctrl.a, IRAService.shared.b],
          builder: (BuildContext context, List<dynamic> values) {
            return Column(
              children: [
                Text(
                  'hello',
                ),
              ],
            );
          },
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });
});
