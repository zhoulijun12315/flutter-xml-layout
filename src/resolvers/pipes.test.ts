import { generateWidget, assertEqual } from '../test/shared';

suite("Pipes Tests", function () {

    test("basic translate", function() {
        const xml = `<Text text="text | translate" />`;

        const expected = `
        Text(
            pipeProvider.transform(context, "translate", text, []),
          )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("pipe chaining", function() {
        const xml = `<Text text="text | beforeTranslate | translate | afterTranslate" />`;

        const expected = `
        Text(
            pipeProvider.transform(context, "afterTranslate", pipeProvider.transform(context, "translate", pipeProvider.transform(context, "beforeTranslate", text, []), []), []),
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("pipe groups", function() {
        const xml = `<Text text="(firstText | translate) + ' : ' + (secondText | somePipe)" />`;

        const expected = `
        Text(
            (pipeProvider.transform(context, "translate", firstText, [])) + ' : ' + (pipeProvider.transform(context, "somePipe", secondText, [])),
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("stream pipe", function() {
        const xml = `<Text text="textStream | stream" />`;

        const expected = `
        StreamBuilder(
          initialData: null,
          stream: textStream,
            builder: (BuildContext context, textStreamSnapshot) {
              final textStreamValue = textStreamSnapshot.data;
              if (textStreamValue == null) {
                return Container(width: 0, height: 0);
              }
              return Text(
                textStreamValue,
              );
            },
          )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("behavior pipe", function() {
        const xml = `<Text text="textBehavior | behavior" />`;

        const expected = `
        StreamBuilder(
          initialData: textBehavior.value,
          stream: textBehavior,
            builder: (BuildContext context, textBehaviorSnapshot) {
              final textBehaviorValue = textBehaviorSnapshot.data;
              if (textBehaviorValue == null) {
                return Container(width: 0, height: 0);
              }
              return Text(
                textBehaviorValue,
              );
            },
          )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("pipe chaining with stream", function() {
        const xml = `<Text text="textStream | beforeStream | stream | afterStream" />`;

        const expected = `
        StreamBuilder(
          initialData: null,
          stream: pipeProvider.transform(context, "beforeStream", textStream, []),
            builder: (BuildContext context, pipeProviderTransformContextBeforeStreamTextStreamSnapshot) {
              final pipeProviderTransformContextBeforeStreamTextStreamValue = pipeProviderTransformContextBeforeStreamTextStreamSnapshot.data;
              if (pipeProviderTransformContextBeforeStreamTextStreamValue == null) {
                return Container(width: 0, height: 0);
              }
              return Text(
                pipeProvider.transform(context, "afterStream", pipeProviderTransformContextBeforeStreamTextStreamValue, []),
              );
            },
          )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("pipe groups with stream", function() {
        const xml = `<Text text="(firstTextStream | stream) + ':' + (secondText | translate)" />`;

        const expected = `
        StreamBuilder(
          initialData: null,
          stream: firstTextStream,
            builder: (BuildContext context, firstTextStreamSnapshot) {
              final firstTextStreamValue = firstTextStreamSnapshot.data;
              if (firstTextStreamValue == null) {
                return Container(width: 0, height: 0);
              }
              return Text(
                (firstTextStreamValue) + ':' + (pipeProvider.transform(context, "translate", secondText, [])),
              );
            },
          )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("mutiple grouped stream", function() {
        const xml = `<Text text="(firstTextStream | stream) + ':' + (secondTextStream | stream)" />`;

        const expected = `
        StreamBuilder(
            initialData: null,
            stream: secondTextStream,
            builder: (BuildContext context, secondTextStreamSnapshot) {
              final secondTextStreamValue = secondTextStreamSnapshot.data;
              if (secondTextStreamValue == null) {
                return Container(width: 0, height: 0);
              }
              return StreamBuilder(
                initialData: null,
                stream: firstTextStream,
                builder: (BuildContext context, firstTextStreamSnapshot) {
                  final firstTextStreamValue = firstTextStreamSnapshot.data;
                  if (firstTextStreamValue == null) {
                    return Container(width: 0, height: 0);
                  }
                  return Text(
                    (firstTextStreamValue) + ':' + (secondTextStreamValue),
                  );
                },
              );
            },
          )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("stream pipe - mutiple times - same widget (should generate one StreamBuilder)", function() {
        const xml = `
        <Text foregroundColor="(component.menuVisible | stream) ? Colors.lightBlue : Colors.white"
              backgroundColor="(component.menuVisible | stream) ? Colors.white : Colors.lightBlue">
        </Text>
`;

        const expected = `
        StreamBuilder(
          initialData: null,
          stream: component.menuVisible,
          builder: (BuildContext context, componentMenuVisibleSnapshot) {
            final componentMenuVisibleValue = componentMenuVisibleSnapshot.data;
            if (componentMenuVisibleValue == null) {
              return Container(width: 0, height: 0);
            }
            return Text(
              backgroundColor: (componentMenuVisibleValue) ? Colors.white : Colors.lightBlue,
              foregroundColor: (componentMenuVisibleValue) ? Colors.lightBlue : Colors.white,
            );
          },
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("stream pipe - mutiple times - same property (should generate one StreamBuilder)", function() {
        const xml = `
<ClipPath clipper="ContainerClipper((component.menuAnimButtonPosition | stream) >= MediaQuery.of(context).size.height * 0.3 ? (MediaQuery.of(context).size.height * 0.3) - ((component.menuAnimButtonPosition | stream) - (MediaQuery.of(context).size.height * 0.3)) : (component.menuAnimButtonPosition | stream))" >
</ClipPath>
`;

        const expected = `
      StreamBuilder(
        initialData: null,
        stream: component.menuAnimButtonPosition,
          builder: (BuildContext context, componentMenuAnimButtonPositionSnapshot) {
            final componentMenuAnimButtonPositionValue = componentMenuAnimButtonPositionSnapshot.data;
            if (componentMenuAnimButtonPositionValue == null) {
              return Container(width: 0, height: 0);
            }
            return ClipPath(
              clipper: ContainerClipper((componentMenuAnimButtonPositionValue) >= MediaQuery.of(context).size.height * 0.3 ? (MediaQuery.of(context).size.height * 0.3) - ((componentMenuAnimButtonPositionValue) - (MediaQuery.of(context).size.height * 0.3)) : (componentMenuAnimButtonPositionValue)),
            );
          },
      )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("no pipes just string", function() {
        const xml = `
      <Column>
        <Text text='"someText | translate"'/>
        <Text text="'someText | translate'"/>
        <Text text='"(someText | translate)"'/>
        <Text text="'(someText | translate)'"/>
      </Column>
`;

        const expected = `
        Column(
          children: [
            Text(
              "someText | translate",
            ),
            Text(
              'someText | translate',
            ),
            Text(
              "(someText | translate)",
            ),
            Text(
                '(someText | translate)',
            ),
          ],
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("pipes inside ${}", function() {
        const xml = `
      <Column>
        <Text text="'\${someText | translate}'"/>
        <Text text='"\${(someText | translate)}"'/>
        <Text text="'\${(someText | translate)}'"/> 
      </Column>
`;

        const expected = `
    Column(
      children: [
        Text(
          '\${pipeProvider.transform(context, "translate", {someText, [])}',
        ),
        Text(
          "\${(pipeProvider.transform(context, "translate", someText, []))}",
        ),
        Text(
          '\${(pipeProvider.transform(context, "translate", someText, []))}',
        ),
      ],
    )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("stream pipe - mutiple times - with :disable (should generate one StreamBuilder)", function() {
        const xml = `
    <RaisedButton :margin="30 0 0" padding="10 0" color="#3b5998" onPressed="ctrl.loginWithFacebook"
                    shape="RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))"
                    :disable="(ctrl.facebookLoggingStatusStream | stream) == ButtonState.inProgress">
        <Row mainAxisAlignment="center">
          <Icon :margin="0 10" icon="Ionicons.getIconData('logo-facebook')" />
          <Text text="'Login with Facebook'" />
          <SizedBox :margin="0 4" :if="(ctrl.facebookLoggingStatusStream | stream) == ButtonState.inProgress" width="28" height="28">
            <CircularProgressIndicator strokeWidth="2" />
          </SizedBox>
        </Row>
      </RaisedButton>
`;

        const expected = `
        StreamBuilder(
          initialData: null,
          stream: ctrl.facebookLoggingStatusStream,
          builder: (BuildContext context, ctrlFacebookLoggingStatusStreamSnapshot) {
            final ctrlFacebookLoggingStatusStreamValue = ctrlFacebookLoggingStatusStreamSnapshot.data;
            return Disable(
              event: ctrl.loginWithFacebook,
              value: (ctrlFacebookLoggingStatusStreamValue) == ButtonState.inProgress,
              builder: (BuildContext context, event) {
                return Padding(
                  padding: const EdgeInsets.fromLTRB(0, 30, 0, 0),
                  child: RaisedButton(
                    color: Color.fromARGB(255, 59, 89, 152),
                    onPressed: event,
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 0),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 0, horizontal: 10),
                          child: Icon(
                            Ionicons.getIconData('logo-facebook'),
                          ),
                        ),
                        Text(
                          'Login with Facebook',
                        ),
                        WidgetHelpers.ifTrue((ctrlFacebookLoggingStatusStreamValue) == ButtonState.inProgress,
                          () => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 0, horizontal: 4),
                            child: SizedBox(
                              height: 28,
                              width: 28,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            ),
                          ),
                          () => Container(width: 0, height: 0)
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("stream pipe - mutiple times - propertyElement (should generate one StreamBuilder)", function() {
        const xml = `
      <Scaffold>
        <body>
          <RaisedButton :margin="30 0 0" padding="10 0" color="#3b5998" onPressed="ctrl.loginWithFacebook"
                          shape="RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))"
                          :disable="(ctrl.facebookLoggingStatusStream | stream) == ButtonState.inProgress">
              <Row mainAxisAlignment="center">
                <Icon :margin="0 10" icon="Ionicons.getIconData('logo-facebook')" />
                <Text text="'Login with Facebook'" />
                <SizedBox :margin="0 4" :if="(ctrl.facebookLoggingStatusStream | stream) == ButtonState.inProgress" width="28" height="28">
                  <CircularProgressIndicator strokeWidth="2" />
                </SizedBox>
              </Row>
            </RaisedButton>
        </body>
      </Scaffold>
`;

        const expected = `
        Scaffold(
          body: StreamBuilder(
            initialData: null,
            stream: ctrl.facebookLoggingStatusStream,
            builder: (BuildContext context, ctrlFacebookLoggingStatusStreamSnapshot) {
              final ctrlFacebookLoggingStatusStreamValue = ctrlFacebookLoggingStatusStreamSnapshot.data;
              return Disable(
                event: ctrl.loginWithFacebook,
                value: (ctrlFacebookLoggingStatusStreamValue) == ButtonState.inProgress,
                builder: (BuildContext context, event) {
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(0, 30, 0, 0),
                    child: RaisedButton(
                      color: Color.fromARGB(255, 59, 89, 152),
                      onPressed: event,
                      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 0),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 0, horizontal: 10),
                            child: Icon(
                              Ionicons.getIconData('logo-facebook'),
                            ),
                          ),
                          Text(
                            'Login with Facebook',
                          ),
                          WidgetHelpers.ifTrue((ctrlFacebookLoggingStatusStreamValue) == ButtonState.inProgress,
                            () => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 0, horizontal: 4),
                              child: SizedBox(
                                height: 28,
                                width: 28,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                            ),
                            () => Container(width: 0, height: 0)
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          ),
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("grouped multi-pipe chain inside an expression", function() {
        const xml = `
<Text text="'chained → ' + ('hello' | translate | uppercase)" />
`;

        const expected = `
        Text(
          'chained → ' + (pipeProvider.transform(context, "uppercase", pipeProvider.transform(context, "translate", 'hello', []), [])),
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("pipe with explicit ?? fallback skips the null guard", function() {
        const xml = `<Text text="(ctrl.timeRemainingText | behavior) ?? ''" />`;

        const expected = `
        StreamBuilder(
          initialData: ctrl.timeRemainingText.value,
          stream: ctrl.timeRemainingText,
          builder: (BuildContext context, ctrlTimeRemainingTextSnapshot) {
            final ctrlTimeRemainingTextValue = ctrlTimeRemainingTextSnapshot.data;
            return Text(
              (ctrlTimeRemainingTextValue) ?? '',
            );
          },
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("null guard is decided per pipe group, not globally", function() {
        const xml = `
<Column :if="(ctrl.dividends | behavior).length != 0 && (ctrl.selectedGroup | behavior) != null">
  <Text text="'x'" />
</Column>
`;

        const expected = `
        StreamBuilder(
          initialData: ctrl.selectedGroup.value,
          stream: ctrl.selectedGroup,
          builder: (BuildContext context, ctrlSelectedGroupSnapshot) {
            final ctrlSelectedGroupValue = ctrlSelectedGroupSnapshot.data;
            return StreamBuilder(
              initialData: ctrl.dividends.value,
              stream: ctrl.dividends,
              builder: (BuildContext context, ctrlDividendsSnapshot) {
                final ctrlDividendsValue = ctrlDividendsSnapshot.data;
                if (ctrlDividendsValue == null) {
                  return Container(width: 0, height: 0);
                }
                return WidgetHelpers.ifTrue((ctrlDividendsValue).length != 0 && (ctrlSelectedGroupValue) != null,
                  () => Column(
                    children: [
                      Text(
                        'x',
                      ),
                    ],
                  ),
                  () => Container(width: 0, height: 0)
                );
              },
            );
          },
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("pipe inside a ternary keeps the null guard", function() {
        const xml = `<Text text="(ctrl.needLoading | behavior) ? 'loading' : 'done'" />`;

        const expected = `
        StreamBuilder(
          initialData: ctrl.needLoading.value,
          stream: ctrl.needLoading,
          builder: (BuildContext context, ctrlNeedLoadingSnapshot) {
            final ctrlNeedLoadingValue = ctrlNeedLoadingSnapshot.data;
            if (ctrlNeedLoadingValue == null) {
              return Container(width: 0, height: 0);
            }
            return Text(
              (ctrlNeedLoadingValue) ? 'loading' : 'done',
            );
          },
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });

    test("same stream with different null handling keeps separate builders", function() {
        const xml = `
<Container :if="(ctrl.x | behavior) != null">
  <Text text="(ctrl.x | behavior) ? 'a' : 'b'" />
</Container>
`;

        const expected = `
        StreamBuilder(
          initialData: ctrl.x.value,
          stream: ctrl.x,
          builder: (BuildContext context, ctrlXSnapshot) {
            final ctrlXValue = ctrlXSnapshot.data;
            return WidgetHelpers.ifTrue((ctrlXValue) != null,
              () => Container(
                child: StreamBuilder(
                  initialData: ctrl.x.value,
                  stream: ctrl.x,
                  builder: (BuildContext context, ctrlXSnapshot) {
                    final ctrlXValue = ctrlXSnapshot.data;
                    if (ctrlXValue == null) {
                      return Container(width: 0, height: 0);
                    }
                    return Text(
                      (ctrlXValue) ? 'a' : 'b',
                    );
                  },
                ),
              ),
              () => Container(width: 0, height: 0)
            );
          },
        )
`;

        const generated = generateWidget(xml);
        assertEqual(generated, expected);
    });
});
