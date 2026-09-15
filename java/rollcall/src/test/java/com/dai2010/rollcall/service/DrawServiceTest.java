package com.dai2010.rollcall.service;

import com.dai2010.rollcall.model.Person;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DrawServiceTest {
    private final List<Person> people = new ArrayList<>(List.of(
            new Person(1, "张三"), new Person(2, "李四"), new Person(3, "王五"), new Person(4, "赵六")));

    @Test
    void continuousDrawDoesNotRepeatAndReportsRemaining() {
        DrawService service = new DrawService(new Random(4));
        Set<Integer> drawn = new LinkedHashSet<>();

        DrawService.DrawResult first = service.draw(people, 2, true, drawn);
        DrawService.DrawResult second = service.draw(people, 2, true, drawn);

        assertEquals(2, first.selected().size());
        assertEquals(0, second.remaining());
        assertEquals(4, drawn.size());
        assertEquals(4, first.selected().stream().map(Person::getId).distinct().count()
                + second.selected().stream().map(Person::getId).distinct().count());
    }

    @Test
    void insufficientContinuousGroupLeavesStateUntouched() {
        DrawService service = new DrawService(new Random(2));
        Set<Integer> drawn = new LinkedHashSet<>(Set.of(1, 2));

        assertThrows(DrawService.InsufficientPeopleException.class,
                () -> service.drawGroups(people, 2, 2, true, drawn));
        assertEquals(Set.of(1, 2), drawn);
    }

    @Test
    void nonContinuousDrawCanRequestMultipleGroupsWithoutChangingState() {
        DrawService service = new DrawService(new Random(1));
        Set<Integer> drawn = new LinkedHashSet<>();

        List<List<Person>> groups = service.drawGroups(people, 2, 3, false, drawn);

        assertEquals(3, groups.size());
        assertEquals(0, drawn.size());
        assertThrows(IllegalArgumentException.class, () -> service.draw(people, 5, false, drawn));
    }
}
